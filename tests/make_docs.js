// Gera as capturas do README (docs/img) com o painel real e os destaques numerados.
// uso: node tests/make_docs.js [pt|en|es]   (en e es vão para docs/img/en e docs/img/es)
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { setup, serve, annotate, clearMarks, ROOT } = require('./lib_panel');

const LANG = process.argv[2] || 'pt';
const OUT = path.join(ROOT, 'docs/img', LANG === 'pt' ? '' : LANG);
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
	const { comp, select, ctx } = await setup(page, { theme: 'dark', mode: 'layers', lang: LANG });
	const w = (ms) => page.waitForTimeout(ms);

	async function shot(name, marks, opts) {
		opts = opts || {};
		if (!opts.mouse) await page.mouse.move(1, 1);
		await page.evaluate((keep) => {
			let st = document.getElementById('__noTip');
			if (!st) { st = document.createElement('style'); st.id = '__noTip'; document.head.appendChild(st); }
			st.textContent = keep ? '' : '.tip{display:none!important}';
		}, !!opts.tip);
		if (marks && marks.length) await annotate(page, marks);
		await w(200);
		await page.screenshot({ path: path.join(OUT, name + '.png') });
		await clearMarks(page);
		console.log('✓', name);
	}
	const hideToast = () => page.evaluate(() => window.BIN.ui.hideToast());

	// 01 · vazio
	select([]);
	const srv = await serve(); // por HTTP: o painel carrega as traduções (i18n/textos.csv)
	await page.goto(srv.url);
	await w(600);
	await shot('01-vazio', [
		{ sel: '#captureBtn', n: 1, side: 'left' },
		{ sel: '#captureCompBtn', n: 2 },
		{ sel: '.tabs', n: 3, pad: 2 },
		{ sel: '#themeBtn', n: 4, pad: 0 }
	]);

	// 02 · uma layer
	select(['TITULO_principal']);
	await page.click('#captureBtn');
	await page.waitForSelector('#propsView:not(.hidden)');
	await w(700);
	await hideToast();
	await page.click('.row.leaf[data-id$="/attrs/matte"]');
	await w(300);
	await shot('02-propriedades', [
		{ sel: '#chip', n: 1, pad: 2 },
		{ sel: '#modeSeg', n: 2, pad: 2 },
		{ sel: '.search', n: 3, pad: 0 },
		{ sel: '.toggles', n: 4, pad: 2 },
		{ sel: '.row.leaf.off', n: 5, pad: 0, radius: 4 },
		{ sel: '#sum', n: 6, pad: 2, side: 'top' }
	]);
	await page.click('.row.leaf[data-id$="/attrs/matte"]');

	// 02b · uma linha fora (com o mouse em cima)
	const round = 'xpath=//div[contains(@class,"row") and contains(@class,"leaf") and .//span[text()="Roundness"]]';
	await page.click(round);
	await page.evaluate(() => { document.getElementById('tab-props').scrollTop = 200; });
	await page.hover(round);
	await w(200);
	await shot('02b-linha-fora', [{ sel: '.row.leaf.off .eye', n: 1, pad: 2, radius: 7 }], { mouse: true });
	await page.click(round);
	await page.evaluate(() => { document.getElementById('tab-props').scrollTop = 0; });

	// 11 · tooltip
	await page.mouse.move(1, 1);
	await w(600);
	await page.hover('.row.leaf[data-id$="/attrs/blendingMode"]');
	await w(900);
	await shot('11-tooltip', null, { mouse: true, tip: true });

	// 03 · código
	await page.mouse.move(1, 1);
	await page.click('.tab[data-tab=code]');
	await w(600);
	await shot('03-codigo', [
		{ sel: '#fileName', n: 1, pad: 2, side: 'bottom' },
		{ sel: '#copyBtn', n: 2, pad: 0 },
		{ sel: '.tk-fold', n: 3, pad: 1, radius: 3 },
		{ sel: '.opts', n: 4, pad: 2 }
	]);

	// 04 · recriar
	await page.click('.tab[data-tab=props]');
	await w(400);
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done');
	await w(500);
	await shot('04-recriada', [
		{ sel: '#toast .toast-acts', n: 1, pad: 4 },
		{ sel: '#runBtn', n: 2, pad: 2 }
	]);
	await hideToast();
	await w(4200); // o botão volta ao normal

	// 05 · várias layers e 06 · avisos
	select(['CTRL_titulo', 'TITULO_principal', 'CRÉDITO direção']);
	comp._layers[0].selected = false; // a cópia recriada fica de fora
	await page.click('#chip');
	await w(700);
	await hideToast();
	await shot('05-varias-layers', [{ sel: '.layer-head', n: 1, pad: 2 }, { sel: '.layer-head', i: 1, n: 2, pad: 2 }]);
	await page.click('#warnPill');
	await w(400);
	await shot('06-avisos', [{ sel: '#warnPill', n: 1, pad: 2, side: 'top' }]);
	await hideToast();

	// 07 · utilitários
	await page.click('.tab[data-tab=tools]');
	await page.click('#exprBtn');
	await page.click('#binDrop');
	await w(500);
	await hideToast();
	await shot('07-utilitarios', [
		{ sel: '#exprBtn', n: 1, pad: 2 },
		{ sel: '#exprOut .out-bar', n: 2, pad: 2 },
		{ sel: '#binDrop', n: 3, pad: 2 }
	]);

	// 09 · comp inteira
	await page.click('.tab[data-tab=props]');
	ctx.app.project.activeItem = comp;
	await page.click('#modeSeg [data-value=comp]');
	await page.waitForFunction(() => document.getElementById('chipType').textContent === 'COMP');
	await w(600);
	await hideToast();
	await page.hover('xpath=//div[contains(@class,"layer-row") and .//span[text()="Luz"]]');
	await page.click('xpath=//div[contains(@class,"layer-row") and .//span[text()="Luz"]]//button[contains(@class,"eye")]');
	await w(300);
	await shot('09-comp', [
		{ sel: '.comp-head', n: 1, pad: 0 },
		{ sel: '.card', n: 2, pad: 2 },
		{ sel: '.card.list', n: 3, pad: 2 },
		{ sel: '.layer-row.off', n: 4, pad: 0, radius: 4, side: 'left' }
	]);

	// 09b · detalhe de uma layer da comp
	await page.click('xpath=//div[contains(@class,"layer-row") and .//span[text()="CRÉDITO direção"]]');
	await page.waitForSelector('.focus-head');
	await w(400);
	await shot('09b-comp-layer', [{ sel: '.back', n: 1, pad: 2 }, { sel: '.focus-head', n: 2, pad: 2 }]);
	await page.click('.back');
	await w(300);

	// 10 · comp recriada
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done');
	await w(500);
	await shot('10-comp-recriada', [{ sel: '#toast', n: 1, pad: 2 }]);
	await hideToast();
	await w(4200);

	// 08 · tema claro
	await page.click('#modeSeg [data-value=layers]');
	await w(700);
	await hideToast();
	await page.click('#themeBtn');
	await w(800);
	await shot('08-claro', [{ sel: '#themeBtn', n: 1, pad: 0 }]);

	// 12 · editor livre (sem captura) e 13 · código gerado editado à mão
	const p2 = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	const s2 = await setup(p2, { theme: 'dark', mode: 'layers', lang: LANG });
	s2.select([]);
	await p2.goto(srv.url);
	await p2.waitForTimeout(600);
	await p2.click('#scriptBtn');
	await p2.keyboard.type('var comp = app.project.activeItem;\nvar t = comp.layers.addText("BIN");\nt.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540]);\nt.selected = true;', { delay: 0 });
	await p2.mouse.move(1, 1);
	await p2.waitForTimeout(300);
	await p2.screenshot({ path: path.join(OUT, '12-editor-livre.png') });
	console.log('✓', '12-editor-livre');
	await p2.fill('#codeEdit', '');
	await p2.dispatchEvent('#codeEdit', 'input');
	s2.select(['TITULO_principal']);
	await p2.evaluate(() => window.BIN.app.capture(true));
	await p2.waitForTimeout(500);
	await p2.evaluate(() => window.BIN.ui.hideToast());
	await p2.click('.tab[data-tab=code]');
	await p2.waitForTimeout(300);
	const txt = (await p2.inputValue('#codeEdit')).replace("name: 'TITULO_principal'", "name: 'TITULO_editado'");
	await p2.fill('#codeEdit', txt);
	await p2.dispatchEvent('#codeEdit', 'input');
	await p2.evaluate(() => { const t = document.getElementById('codeEdit'); t.scrollTop = 140; t.dispatchEvent(new Event('scroll')); });
	await p2.mouse.move(1, 1);
	await p2.waitForTimeout(300);
	await p2.screenshot({ path: path.join(OUT, '13-editor-editado.png') });
	console.log('✓', '13-editor-editado');

	await browser.close();
	srv.close();
})();
