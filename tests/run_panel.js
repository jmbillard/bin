// Testa o painel fora do After Effects: Chromium + host.jsx real rodando no mock do AE (Node).
// As chamadas evalScript do painel são encaminhadas para o mock via BIN_MOCK.
// uso: node tests/run_panel.js [pasta das capturas de tela]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createContext, loadHost } = require('./ae_mock');
const scene = require('./scene');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

const ctx = createContext();
loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
const comp = scene(ctx);
const select = (names) => comp._layers.forEach((l) => { l.selected = names.indexOf(l.name) >= 0; });
const logo = fs.readFileSync(path.join(__dirname, '../docs/img/logo.png')).toString('base64');

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok   ' : 'FALHA') + ' ' + label); if (!ok) failed = true; };

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });

	await page.exposeFunction('__host', (fn, args) => {
		if (typeof ctx[fn] !== 'function') return JSON.stringify({ error: 'função inexistente: ' + fn });
		return ctx[fn].apply(null, args);
	});
	await page.addInitScript(({ logo }) => {
		try { localStorage.setItem('bin.settings', JSON.stringify({ theme: 'dark' })); } catch (e) { }
		window.__saved = {};
		window.BIN_MOCK = {
			callHost: (fn, args) => window.__host(fn, args),
			openFiles: () => ['/tmp/logo.png'],
			readBinary: () => Uint8Array.from(atob(logo), (c) => c.charCodeAt(0)),
			saveFile: (t, name) => '/tmp/' + name,
			writeText: (p, t) => { window.__saved[p] = t; }
		};
	}, { logo });

	const url = 'file://' + path.join(__dirname, '../bin-cep/index.html');
	const shot = (name) => page.screenshot({ path: path.join(outDir, name + '.png') });

	// 1 · vazio (nada selecionado)
	select([]);
	await page.goto(url);
	await page.waitForTimeout(400);
	check(await page.isVisible('#empty'), 'estado vazio sem seleção');
	await shot('01-vazio');

	// 2 · uma layer
	select(['TITULO_principal']);
	await page.click('#captureBtn');
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.waitForTimeout(300);
	check((await page.textContent('#chipName')) === 'TITULO_principal', 'chip mostra a layer capturada');
	check((await page.textContent('#chipType')) === 'SHAPE', 'chip mostra o tipo');
	await page.evaluate(() => window.BIN.ui.hideToast());
	await shot('02-propriedades');

	// clicar na linha tira a propriedade do script; clicar de novo devolve
	const gen = () => page.evaluate(() => window.BIN.codegen.generate(window.BIN.state.m, { excluded: window.BIN.state.ex }));
	const roundRow = 'xpath=//div[contains(@class,"row") and contains(@class,"leaf") and .//span[text()="Roundness"]]';
	await page.click(roundRow);
	const sem = await gen();
	const riscada = await page.$eval(roundRow, (e) => e.classList.contains('off'));
	await page.hover(roundRow);
	await shot('02b-linha-fora');
	await page.click(roundRow);
	check(riscada && !/Rect Roundness/.test(sem) && /Rect Roundness/.test(await gen()), 'clicar na linha tira e devolve a propriedade');

	// desliga o efeito Glow e confere o código
	// cards fechados não desenham as linhas: abre antes de procurar
	await (await page.$('xpath=//div[contains(@class,"card-head")][.//b[text()="effects"]]')).click();
	await page.waitForTimeout(100);
	const glowRow = await page.$('xpath=//div[contains(@class,"card")][.//b[text()="effects"]]//div[contains(@class,"row") and .//span[text()="Glow"]]//button[contains(@class,"eye")]');
	await glowRow.click();
	await page.click('.tab[data-tab=code]');
	await page.waitForTimeout(400);
	const code = await page.evaluate(() => window.BIN.codegen.generate(window.BIN.state.m, { excluded: window.BIN.state.ex }));
	check(!/ADBE Glo2/.test(code) && /ADBE Fill/.test(code), 'desmarcar o Glow tira o efeito do código');
	check(await page.isVisible('#foldHelpers'), 'funções auxiliares recolhidas na prévia');
	await shot('03-codigo');

	// 3 · recriar
	await page.click('.tab[data-tab=props]');
	const before = comp.numLayers;
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done', { timeout: 5000 });
	await page.waitForTimeout(300);
	check(comp.numLayers === before + 1, 'recriar adiciona a layer na comp ativa');
	const made = comp._layers[0];
	check(made.name === 'TITULO_principal' && made.property('ADBE Effect Parade').numProperties === 1, 'layer recriada sem o Glow');
	await shot('04-recriada');

	// desfazer (o mock só registra a chamada)
	// 4 · várias layers
	await page.evaluate(() => window.BIN.ui.hideToast());
	select(['CTRL_titulo', 'TITULO_principal', 'CRÉDITO direção']);
	comp._layers[0].selected = false; // a cópia recriada fica de fora
	await page.click('#chip');
	await page.waitForTimeout(500);
	await page.evaluate(() => window.BIN.ui.hideToast());
	check((await page.textContent('#chipType')) === '3 LAYERS', 'captura de várias layers');
	await shot('05-varias-layers');
	await page.click('#warnPill');
	await page.waitForTimeout(200);
	await shot('06-avisos');
	await page.evaluate(() => window.BIN.ui.hideToast());

	// 5 · utilitários
	await page.click('.tab[data-tab=tools]');
	await page.click('#exprBtn');
	await page.waitForSelector('#exprOut:not(.hidden)');
	await page.click('#binDrop');
	await page.waitForSelector('#binOut:not(.hidden)');
	await page.waitForTimeout(200);
	const exprTxt = await page.textContent('#exprOut pre');
	check(/var expRotation = \[/.test(exprTxt), 'expressão → string');
	check(/var logoPng = '\\x89PNG/.test(await page.textContent('#binOut pre')), 'arquivo → binário');
	await shot('07-utilitarios');

	// 6 · comp inteira
	await page.click('.tab[data-tab=props]');
	await page.click('#modeSeg [data-value=comp]');
	await page.waitForFunction(() => document.getElementById('chipType').textContent === 'COMP');
	await page.waitForTimeout(300);
	check((await page.textContent('#chipName')) === 'ABERTURA_v03', 'captura da comp inteira');
	check((await page.$$('.comp-head')).length === 3, 'comp principal + 2 precomps na árvore');
	await page.evaluate(() => window.BIN.ui.hideToast());
	await (await page.$('xpath=//div[contains(@class,"layer-head")][.//span[text()="TITULO_principal"]]')).click();
	await page.waitForTimeout(200);
	await shot('09-comp');
	const items = ctx.app.project.numItems;
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done', { timeout: 5000 });
	const newComps = ctx.app.project._items.slice(items).filter((i) => i.constructor.name === 'CompItem');
	check(newComps.length === 3 && ctx.app.project.activeItem === newComps[2] && newComps[2].numLayers === comp.numLayers, 'recriar a comp cria a principal e as precomps');
	await page.waitForTimeout(200);
	await shot('10-comp-recriada');
	await page.evaluate(() => window.BIN.ui.hideToast());

	// desmarcar a precomp do meio tira também a de dentro
	ctx.app.project.activeItem = comp;
	await page.click('#chip');
	await page.waitForTimeout(400);
	await (await page.$('xpath=//div[contains(@class,"comp-head")][.//span[contains(text(),"PRE logo")]]//button[contains(@class,"eye")]')).click();
	await page.waitForTimeout(200);
	const offs = await page.$$eval('.comp-head.off', (els) => els.length);
	check(offs === 2 && /recriar comp$/.test(await page.textContent('#runTxt')), 'desmarcar uma precomp tira as que só ela usa');
	await page.evaluate(() => window.BIN.ui.hideToast());

	// 7 · tema claro
	await page.click('#modeSeg [data-value=layers]');
	select(['CTRL_titulo', 'TITULO_principal', 'CRÉDITO direção']);
	await page.waitForTimeout(300);
	await page.click('#chip');
	await page.waitForTimeout(400);
	await page.evaluate(() => window.BIN.ui.hideToast());
	await page.click('.tab[data-tab=props]');
	await page.click('#themeBtn');
	await page.waitForTimeout(700);
	await shot('08-claro');

	// exportar
	await page.click('.tab[data-tab=code]');
	await page.click('#exportBtn');
	await page.waitForTimeout(200);
	const saved = await page.evaluate(() => window.__saved);
	check(Object.keys(saved).some((k) => /criar_abertura_v03\.jsx$/.test(k)), 'exportar .jsx');
	await shot('11-codigo-claro');

	await browser.close();
	process.exit(failed ? 1 : 0);
})();
