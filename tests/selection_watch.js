// O painel acompanha a seleção do After Effects: tela inicial com o que está selecionado,
// aviso no chip quando a captura fica para trás, sem mexer no resto da tela.
// uso: node tests/selection_watch.js [pasta de saída]
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
	const { comp, select, ctx } = await setup(page, { theme: 'dark', mode: 'layers' });
	const srv = await serve();
	const tick = () => page.waitForTimeout(1300); // o painel pergunta a cada segundo
	// o aviso fica no próprio chip: destacado e com a seleção nova na segunda linha
	const bar = () => page.$eval('#chip', (e) => e.classList.contains('stale'));
	const meta = () => page.textContent('#chipMeta');
	const top = () => page.$eval('.tabs', (e) => e.getBoundingClientRect().top);
	const hide = () => page.evaluate(() => window.BIN.ui.hideToast());

	// 1 · tela inicial acompanha a seleção
	select([]);
	await page.goto(srv.url);
	await tick();
	check((await page.textContent('#emptyTitle')) === 'selecione uma layer em “ABERTURA_v03”' && await page.isDisabled('#captureBtn'), 'tela inicial sem seleção: diz em qual comp e o botão fica desligado');
	select(['TITULO_principal']);
	await tick();
	check((await page.textContent('#captureTxt')) === 'capturar “TITULO_principal”' && /1 layer selecionada/.test(await page.textContent('#emptyTitle')), 'tela inicial mostra a layer que vai ser capturada');
	await page.screenshot({ path: path.join(outDir, 'sel-1-inicial.png') });

	// 2 · capturada: sem aviso; mudou a seleção: aviso + chip destacado
	await page.click('#captureBtn');
	await page.waitForSelector('#propsView:not(.hidden)');
	await hide();
	await tick();
	check(!(await bar()) && /ABERTURA_v03 · 14 props/.test(await meta()), 'logo depois de capturar: sem aviso');
	const before = await top();
	select(['CTRL_titulo']);
	await tick();
	check(await bar() && /^atualizar para “CTRL_titulo”$/.test(await meta()), 'seleção mudou: chip destacado com a layer nova');
	check((await top()) === before, 'o aviso não empurra o resto do painel');
	await page.screenshot({ path: path.join(outDir, 'sel-2-aviso.png') });

	// 3 · mais de uma layer
	select(['CTRL_titulo', 'CRÉDITO direção']);
	await tick();
	check(await bar() && /^atualizar para 2 layers$/.test(await meta()), 'várias layers: “atualizar para 2 layers”');

	// 4 · atualizar: clique no chip
	await page.click('#chip');
	await page.waitForFunction(() => document.getElementById('chipType').textContent === '2 LAYERS');
	await hide();
	await tick();
	check(!(await bar()) && /CTRL_titulo, CRÉDITO direção/.test(await page.textContent('#chipName')) && !/atualizar para/.test(await meta()), 'clicar no chip captura a seleção nova');

	// 5 · sem nada selecionado: a captura fica, sem aviso
	select([]);
	await tick();
	check(!(await bar()), 'seleção vazia não é motivo para aviso');

	// 6 · recriar seleciona o que foi criado: sem aviso
	select(['CTRL_titulo', 'CRÉDITO direção']);
	await tick();
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done');
	await tick();
	check(!(await bar()), 'depois de recriar (layers novas selecionadas): sem aviso');
	await hide();

	// 7 · comp inteira: avisa quando a comp ativa muda
	ctx.app.project.activeItem = comp;
	await page.click('#modeSeg [data-value=comp]');
	await page.waitForFunction(() => document.getElementById('chipType').textContent === 'COMP');
	await hide();
	await tick();
	check(!(await bar()), 'comp inteira capturada: sem aviso');
	select(['TITULO_principal']);
	await tick();
	check(!(await bar()), 'comp inteira: mudar a seleção dentro da mesma comp não avisa');
	const pre = ctx.app.project._items.find((i) => i.constructor.name === 'CompItem' && i.name === 'PRE logo');
	ctx.app.project.activeItem = pre;
	await tick();
	check(await bar() && /^atualizar para a comp “PRE logo”$/.test(await meta()), 'comp inteira: outra comp ativa, aviso');
	await page.screenshot({ path: path.join(outDir, 'sel-3-comp.png') });
	await page.keyboard.press('Control+l');
	await page.waitForFunction(() => document.getElementById('chipName').textContent === 'PRE logo');
	await tick();
	check(!(await bar()), 'Ctrl+L atualiza para a comp nova');

	await browser.close();
	srv.close();
	process.exit(failed ? 1 : 0);
})();
