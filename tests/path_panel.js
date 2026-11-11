// Caminho da propriedade na aba utilitários: um bloco por propriedade selecionada, com o caminho legível,
// as expressões (absoluta, relativa à comp, à layer, por matchName) e os scripts; copiar e idiomas.
// uso: node tests/path_panel.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { setup, serve } = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });
let failed = false;
const check = (ok, label, extra) => { console.log((ok ? 'ok    ' : 'FALHA ') + label + (extra ? ' · ' + extra : '')); if (!ok) failed = true; };

(async () => {
	const browser = await chromium.launch();
	for (const lang of ['pt', 'en']) {
		const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
		page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
		const { comp, select } = await setup(page, { theme: 'dark', mode: 'layers', lang });
		const srv = await serve();
		await page.addInitScript(() => { window.__copied = []; document.execCommand = function (c) { if (c === 'copy') window.__copied.push(document.activeElement.value); return true; }; });
		select(['TITULO_principal']);
		await page.goto(srv.url);
		await page.waitForSelector('#propsView:not(.hidden)');
		await page.evaluate(() => window.BIN.ui.hideToast());
		await page.click('.tab[data-tab=tools]');

		if (lang === 'pt') {
			// nada selecionado dentro da layer: aviso
			await page.click('#pathBtn');
			await page.waitForTimeout(250);
			check(/selecione uma propriedade \(ou um grupo\) na timeline/.test(await page.textContent('#toast')) && !(await page.isVisible('#pathOut')), 'sem propriedade selecionada: aviso');
			await page.evaluate(() => window.BIN.ui.hideToast());
		}

		const sh = comp.layer('TITULO_principal');
		sh.property('ADBE Effect Parade').property('Glow').property('ADBE Glo2-0002').selected = true;
		sh.property('ADBE Transform Group').property('ADBE Position').selected = true;
		await page.click('#pathBtn');
		await page.waitForSelector('#pathOut:not(.hidden)');
		const items = await page.$$eval('.path-item', (els) => els.map((e) => ({ crumb: e.querySelector('.path-crumb').textContent, rows: [...e.querySelectorAll('.path-row')].map((r) => [r.querySelector('.path-lab').textContent, r.querySelector('code').textContent]) })));
		const glow = items.find((i) => /Glow Radius/.test(i.crumb)), pos = items.find((i) => /Position/.test(i.crumb));
		const code = (it, lab) => (it.rows.find((r) => r[0] === lab) || [])[1];
		if (lang === 'pt') {
			check(items.length === 2 && !!glow && !!pos, 'duas propriedades selecionadas: dois blocos');
			check(glow.crumb === 'ABERTURA_v03›TITULO_principal›Effects›Glow›Glow Radius' && glow.rows.length === 6, 'caminho legível e 6 caminhos', glow.crumb);
			check(code(glow, 'absoluto (com a comp)') === 'comp("ABERTURA_v03").layer("TITULO_principal").effect("Glow")("Glow Radius")' &&
				code(glow, 'relativo à comp') === 'thisComp.layer("TITULO_principal").effect("Glow")("Glow Radius")' &&
				code(glow, 'relativo à layer') === 'effect("Glow")("Glow Radius")', 'expressões absoluta, relativa à comp e à layer');
			check(code(pos, 'relativo à layer') === 'transform.position' && /\("ADBE Transform Group"\)\("ADBE Position"\)$/.test(code(pos, 'por matchName (qualquer idioma do AE)')), 'atalhos (transform.position) e versão por matchName');
			check(/^app\.project\.item\(\d+\)\.layer\("TITULO_principal"\)\.property\("ADBE Effect Parade"\)\.property\("Glow"\)\.property\("ADBE Glo2-0002"\)$/.test(code(glow, 'absoluto (comp pela posição no projeto)')) && code(glow, 'relativo à layer') && glow.rows.filter((r) => r[0] === 'relativo à layer').length === 2, 'scripts absoluto e relativo');
			// copiar
			await page.click('.path-item:has-text("Glow Radius") [data-path$=":exprAbs"]');
			await page.waitForTimeout(150);
			const copied = await page.evaluate(() => window.__copied.slice(-1)[0]);
			check(copied === 'comp("ABERTURA_v03").layer("TITULO_principal").effect("Glow")("Glow Radius")' && /caminho copiado/.test(await page.textContent('#toast')), 'copiar: o caminho vai para a área de transferência');
			await page.evaluate(() => window.BIN.ui.hideToast());
			await page.screenshot({ path: path.join(outDir, 'path-pt.png') });
		} else {
			check(glow.rows.some((r) => r[0] === 'absolute (with the comp)') && glow.rows.some((r) => r[0] === 'relative to the layer') && (await page.textContent('.tool-body b')) === 'property path', 'em inglês: rótulos traduzidos (o caminho é o mesmo)');
		}
		await page.close();
		srv.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
})();
