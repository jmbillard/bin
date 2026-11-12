// Caminho da propriedade na aba utilitários: um card por propriedade (tipo, nome, chips do caminho), um caminho
// por vez (formato × escopo, valendo para todos os cards e guardado), copiar, grupos acima numa escada
// recolhível, e com duas propriedades o caminho de uma para a outra (com inverter). Também em inglês.
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
		const copied = () => page.evaluate(() => window.__copied.slice(-1)[0]);
		const cards = () => page.$$eval('.path-card:not(.path-link)', (els) => els.map((e) => ({ name: e.querySelector('.path-title b').textContent, chips: [...e.querySelectorAll('.pchip')].map((c) => c.textContent), code: e.querySelector('.path-code code').textContent, hint: e.querySelector('.path-hint').textContent })));
		const GLOW = '.path-card:not(.path-link):has(.path-title b:text-is("Glow Radius"))';

		if (lang === 'pt') {
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
		let cs = await cards();
		const glow = () => cs.find((c) => c.name === 'Glow Radius'), pos = () => cs.find((c) => c.name === 'Position');

		if (lang === 'pt') {
			check(cs.length === 2 && glow() && pos() && glow().chips.join('|') === 'ABERTURA_v03|TITULO_principal|Glow', 'um card por propriedade, com o caminho em chips', glow() && glow().chips.join(' › '));
			check(glow().code === 'comp("ABERTURA_v03").layer("TITULO_principal").effect("Glow")("Glow Radius")' && /qualquer comp do projeto/.test(glow().hint), 'começa na expressão absoluta, com a explicação');
			check((await page.$$eval('#pathOut .path-code code .tk-s', (e) => e.length)) > 0, 'código com as cores do editor');
			// escopo: vale para todos os cards
			await page.click('.path-scope[data-scope=exprLayer]');
			cs = await cards();
			check(glow().code === 'effect("Glow")("Glow Radius")' && pos().code === 'transform.position', 'escopo “layer” troca o caminho em todos os cards');
			// formato script
			await page.click('#pathFmt [data-fmt=jsx]');
			cs = await cards();
			check(/^app\.project\.item\(\d+\)\.layer\("TITULO_principal"\)\.property\("ADBE Effect Parade"\)\.property\("Glow"\)\.property\("ADBE Glo2-0002"\)$/.test(glow().code) && (await page.$$('.path-scope')).length === 2, 'formato script: absoluto e layer');
			await page.click('.path-scope[data-scope=jsxLayer]');
			cs = await cards();
			check(glow().code === 'layer.property("ADBE Effect Parade").property("Glow").property("ADBE Glo2-0002")', 'script relativo à layer');
			// copiar o caminho mostrado
			await page.click(GLOW + ' .path-code [data-pc]');
			check((await copied()) === glow().code && /caminho copiado/.test(await page.textContent('#toast')), 'copiar: o caminho mostrado vai para a área de transferência');
			await page.evaluate(() => window.BIN.ui.hideToast());
			// grupos acima: recolhidos; abrir mostra a escada (layer no topo, a propriedade embaixo)
			check(!(await page.$('.ladder')), 'grupos acima começam recolhidos');
			await page.click(GLOW + ' [data-ups]');
			const rungs = await page.$$eval('.ladder .rung', (rs) => rs.map((r) => [r.querySelector('.rung-n').textContent, r.querySelector('.rung-name').textContent, r.classList.contains('dim')]));
			check(rungs.map((r) => r[0] + ' ' + r[1]).join(' | ') === '↑3 TITULO_principal | ↑2 Effects | ↑1 Glow | ● Glow Radius' && rungs[1][2] === true && rungs[2][2] === false, 'escada: da layer à propriedade, com “Effects” apagado', rungs.map((r) => r.join(':')).join(' | '));
			await page.click('.ladder .rung:has(.rung-name:text-is("Glow"))');
			check((await copied()) === 'thisProperty.propertyGroup(1).name', 'clicar num degrau copia propertyGroup(n).name');
			await page.evaluate(() => window.BIN.ui.hideToast());
			await page.click('#pathFmt [data-fmt=expr]');
			await page.screenshot({ path: path.join(outDir, 'path-pt.png') });
			// entre as duas propriedades: mostra um sentido, com inverter
			const linkA = await page.textContent('.path-link .path-code code');
			const headA = await page.textContent('.path-link-head span');
			await page.click('#pathFlip');
			const linkB = await page.textContent('.path-link .path-code code');
			check([linkA, linkB].sort().join(' | ') === 'effect("Glow")("Glow Radius") | transform.position' && /as duas estão na mesma layer/.test(await page.textContent('.path-link .path-hint')) && /numa expressão em/.test(headA), 'entre as duas: um sentido por vez, com inverter', headA);
			// a escolha fica guardada
			await page.click('.path-scope[data-scope=exprComp]');
			await page.waitForTimeout(200);
			await page.reload();
			await page.waitForSelector('#propsView:not(.hidden)');
			await page.click('.tab[data-tab=tools]');
			await page.click('#pathBtn');
			await page.waitForSelector('#pathOut:not(.hidden)');
			cs = await cards();
			check(glow().code === 'thisComp.layer("TITULO_principal").effect("Glow")("Glow Radius")', 'formato e escopo ficam guardados');
		} else {
			const scopes = await page.$$eval('.path-scope', (b) => b.map((x) => x.textContent));
			check(scopes.join('|') === 'absolute|comp|layer|matchName' && /any comp in the project/.test(glow().hint) && /in an expression on/.test(await page.textContent('.path-link-head span')), 'em inglês: escopos, explicações e o card de ligação traduzidos', scopes.join('|'));
		}
		await page.close();
		srv.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
})();
