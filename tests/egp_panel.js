// Essential graphics no painel: card com os controles da comp (e de onde vem cada um), card com os
// valores mudados nas essential properties da layer de precomp, olho para tirar do script e avisos.
// uso: node tests/egp_panel.js [pasta de saída]
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
	const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
	const { comp, ctx } = await setup(page, { theme: 'dark', mode: 'comp' });
	const srv = await serve();
	const pre = ctx.app.project._items.find((i) => i.name === 'PRE logo');
	pre.layer('circulo').property('ADBE Transform Group').property('ADBE Opacity').addToMotionGraphicsTemplateAs(pre, 'Opacidade');
	comp.layer('CONTROLE').property('ADBE Effect Parade').property('amp').property('ADBE Slider Control-0001').addToMotionGraphicsTemplateAs(comp, 'Amplitude');
	comp.layer('CRÉDITO direção').property('ADBE Text Properties').property('ADBE Text Document').addToMotionGraphicsTemplateAs(comp, 'Crédito');
	comp.motionGraphicsTemplateName = 'Abertura v03';
	comp.layer('PRE logo').property('ADBE Layer Overrides').property('Opacidade').setValue(40);
	const gen = () => page.evaluate(() => window.BIN.codegen.generate(window.BIN.state.m, { excluded: window.BIN.state.ex }));
	const hide = () => page.evaluate(() => window.BIN.ui.hideToast());

	await page.goto(srv.url);
	await page.waitForFunction(() => document.getElementById('chipType').textContent === 'COMP');
	await hide();

	// card da comp principal
	const head = 'xpath=//div[contains(@class,"card-head")][.//b[text()="essential graphics · Abertura v03"]]';
	check(!!(await page.$(head)), 'card “essential graphics” com o nome do template');
	await page.click(head);
	await page.waitForTimeout(250);
	const rows = await page.$$eval('.card:not(.closed) .row.leaf', (rs) => rs.map((r) => r.textContent.trim()));
	check(rows.some((r) => /Amplitude\s*CONTROLE › Slider/.test(r)) && rows.some((r) => /Crédito\s*CRÉDITO direção › Source Text/.test(r)), 'cada controle mostra de onde vem (' + rows.filter((r) => /Amplitude|Crédito/.test(r)).join(' | ') + ')');
	await page.screenshot({ path: path.join(outDir, 'egp-1-card.png') });
	check(/bin\.egp\(comp, L, \[/.test(await gen()) && /'Amplitude'/.test(await gen()) && /'Abertura v03'\);/.test(await gen()), 'o código recria os controles e o nome do template');

	// olho tira um controle
	await page.click('xpath=//div[contains(@class,"row") and contains(@class,"leaf") and .//span[text()="Crédito"]]');
	let code = await gen();
	check(/'Amplitude'/.test(code) && !/'Crédito'/.test(code), 'clicar no controle tira só ele do script');
	await page.click('xpath=//div[contains(@class,"row") and contains(@class,"leaf") and .//span[text()="Crédito"]]');

	// layer de origem fora do script: aviso
	const ctrlRow = 'xpath=//div[contains(@class,"layer-row") and .//span[text()="CONTROLE"]]';
	await page.hover(ctrlRow);
	await page.click(ctrlRow + '//button[contains(@class,"eye")]');
	await page.waitForTimeout(150);
	const warns = await page.evaluate(() => window.BIN.state.warnings.join(' | '));
	check(/“Amplitude” fica de fora porque a layer “CONTROLE” saiu do script/.test(warns) && !/'Amplitude'/.test(await gen()), 'layer de origem fora: o controle sai e o aviso explica');
	await page.click(ctrlRow + '//button[contains(@class,"eye")]');

	// essential properties da layer de precomp
	await page.click('xpath=//div[contains(@class,"layer-row") and .//span[text()="PRE logo"]]');
	await page.waitForSelector('.focus-head');
	const ovHead = 'xpath=//div[contains(@class,"card-head")][.//b[text()="essential properties"]]';
	check(!!(await page.$(ovHead)), 'layer de precomp: card “essential properties”');
	await page.click(ovHead);
	await page.waitForTimeout(200);
	const ov = await page.$$eval('.card:not(.closed) .row.leaf', (rs) => rs.map((r) => r.textContent.trim()).filter((t) => /Opacidade/.test(t)));
	check(ov.length === 1 && /40/.test(ov[0]) && /bin\.over\(layer, \[/.test(await gen()), 'mostra o valor mudado (' + ov[0] + ') e o código o aplica');
	await page.screenshot({ path: path.join(outDir, 'egp-2-precomp.png') });

	// recriar de verdade
	await page.click('.back');
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done');
	const nr = ctx.app.project.activeItem;
	const okRun = nr !== comp && nr._egp.map((e) => e.name).join() === 'Amplitude,Crédito' && nr.motionGraphicsTemplateName === 'Abertura v03' &&
		nr._layers.find((l) => l.name === 'PRE logo').property('ADBE Layer Overrides').property('Opacidade').value === 40;
	check(okRun && !/toast warn|toast error/.test(await page.getAttribute('#toast', 'class')), 'recriar: comp nova com os controles, o template e o valor da precomp, sem avisos');

	await browser.close();
	srv.close();
	process.exit(failed ? 1 : 0);
})();
