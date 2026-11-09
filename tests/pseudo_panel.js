// Pseudo effects no painel: aviso de que precisa estar no PresetEffects.xml e o XML na aba utilitários.
// uso: node tests/pseudo_panel.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { setup, serve } = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
	const { comp, select } = await setup(page, { theme: 'dark', mode: 'layers' });
	const srv = await serve();

	// sem pseudo effect: a seção diz que não há nenhum
	select(['TITULO_principal']);
	await page.goto(srv.url);
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.evaluate(() => window.BIN.ui.hideToast());
	await page.click('.tab[data-tab=tools]');
	check(await page.isVisible('#pseudoNone') && !(await page.isVisible('#pseudoOut')), 'sem pseudo effect: “nenhum pseudo effect na captura”');

	// com pseudo effect
	const fx = comp.layer('CONTROLE').property('ADBE Effect Parade').addProperty('Pseudo/BIN Texto');
	fx.property('Pseudo/BIN Texto-0001').setValue(96);
	select(['CONTROLE']);
	await page.keyboard.press('Control+l');
	await page.waitForFunction(() => document.getElementById('chipName').textContent === 'CONTROLE');
	await page.evaluate(() => window.BIN.ui.hideToast());
	await page.waitForTimeout(200);
	const xml = await page.textContent('#pseudoOut pre');
	check(await page.isVisible('#pseudoOut') && /<Effect matchname="Pseudo\/BIN Texto"/.test(xml) && /default="96"/.test(xml) && /conferir/.test(xml), 'aba utilitários: XML do pseudo effect, com os pontos para conferir');
	check(/1 pseudo effect · BIN Texto/.test(await page.textContent('#pseudoInfo')), 'resumo: quantos e quais');
	const comments = await page.$$eval('#pseudoOut pre .tk-c', (e) => e.length);
	check(comments >= 4, 'comentários do XML em destaque (' + comments + ')');
	await page.screenshot({ path: path.join(outDir, 'pseudo-1-xml.png') });

	await page.click('[data-save=pseudo]');
	await page.waitForTimeout(200);
	const saved = await page.evaluate(() => Object.keys(window.__saved).filter((k) => /pseudo_effects\.xml$/.test(k)).map((k) => window.__saved[k]));
	check(saved.length === 1 && saved[0] === xml, 'exportar: pseudo_effects.xml com o mesmo XML');

	const warns = await page.evaluate(() => window.BIN.state.warnings.join(' | '));
	check(/pseudo effect “BIN Texto”: precisa estar no PresetEffects\.xml/.test(warns) && !/plug-in/.test(warns), 'aviso próprio (e não “plug-in de terceiro”)');

	await browser.close();
	srv.close();
	process.exit(failed ? 1 : 0);
})();
