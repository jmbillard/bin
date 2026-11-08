// Aba código como editor: script livre (sem captura), código gerado editado à mão, erros e atalhos.
// uso: node tests/code_editor.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { setup, url } = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };

(async () => {
	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
	const { comp, select, ctx } = await setup(page, { theme: 'dark', mode: 'layers' });
	const project = ctx.app.project;
	const hasComp = (name) => project._items.some((i) => i.constructor.name === 'CompItem' && i.name === name);
	const toast = () => page.textContent('#toast');

	// 1 · sem captura: o estado vazio leva ao editor
	select([]);
	await page.goto(url);
	await page.waitForTimeout(400);
	check(await page.isDisabled('#runBtn'), 'sem captura e sem script: botão principal desligado');
	await page.click('#scriptBtn');
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'code' && await page.evaluate(() => document.activeElement.id === 'codeEdit'), '“digite um script” abre o editor com o foco nele');

	await page.keyboard.type('var c = app.project.items.addComp("DIGITADA", 640, 360, 1, 2, 24);\nc.openInViewer();');
	await page.waitForTimeout(150);
	check((await page.textContent('#runTxt')) === 'executar script' && !(await page.isDisabled('#runBtn')), 'script digitado: “executar script”');
	check(/tk-s/.test(await page.innerHTML('#codeView')) && (await page.textContent('#lineCount')) === '2 linhas', 'cores e contagem de linhas acompanham o texto');
	await page.screenshot({ path: path.join(outDir, 'editor-1-livre.png') });
	await page.keyboard.press('Control+Enter');
	await page.waitForSelector('#runBtn.done');
	check(hasComp('DIGITADA') && /script executado/.test(await toast()), 'Ctrl+Enter executa o script digitado');

	// o rascunho e a aba ficam guardados
	await page.evaluate(() => window.BIN.ui.hideToast());
	// o Chromium grava o localStorage de páginas file:// com um pequeno atraso; recarregar na hora pode perdê-lo
	await page.waitForTimeout(3000);
	await page.reload();
	await page.waitForFunction(() => document.querySelector('.tab.active') && document.querySelector('.tab.active').dataset.tab === 'code', null, { timeout: 5000 }).catch(() => { });
	const st = await page.evaluate(() => ({ s: localStorage.getItem('bin.settings'), tab: document.querySelector('.tab.active').dataset.tab, scratch: localStorage.getItem('bin.scratch'), ed: document.getElementById('codeEdit').value }));
	if (st.tab !== 'code' || !/DIGITADA/.test(st.ed)) console.log('estado após recarregar:', JSON.stringify(st).slice(0, 300));
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'code' && /DIGITADA/.test(await page.inputValue('#codeEdit')), 'o painel reabre na aba código com o script salvo');

	// Tab insere tabulação
	await page.click('#codeEdit');
	await page.keyboard.press('Control+End');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Tab');
	await page.keyboard.type('x;');
	check(/\n\tx;$/.test(await page.inputValue('#codeEdit')), 'Tab insere tabulação no editor');

	// erro de sintaxe vira aviso
	await page.fill('#codeEdit', 'var a = ;');
	await page.keyboard.press('Control+Enter');
	await page.waitForTimeout(400);
	check(/toast error/.test(await page.getAttribute('#toast', 'class')), 'erro no script vira aviso de erro');
	await page.evaluate(() => window.BIN.ui.hideToast());

	// número da linha do erro: as auxiliares contam como uma linha no editor
	const m = await page.evaluate(() => [
		window.BIN.app.mapError('x (linha 5)', { at: 10, extra: 150 }),
		window.BIN.app.mapError('x (linha 200)', { at: 10, extra: 150 }),
		window.BIN.app.mapError('x (linha 60)', { at: 10, extra: 150 })
	]);
	check(m[0].line === 5 && m[1].line === 50 && /linha 50/.test(m[1].msg) && /funções auxiliares/.test(m[2].msg), 'linha do erro corrigida (antes, depois e dentro das auxiliares)');
	const round = await page.evaluate(() => {
		const code = window.BIN.codegen.generate(window.BIN.codegen.prepare({ mode: 'layers', comp: { id: 1, name: 'c', width: 10, height: 10, pixelAspect: 1, duration: 1, frameRate: 24, settings: {}, markers: [] }, layers: [] }), {});
		return window.BIN.app.expand(window.BIN.app.collapse(code)).code === code;
	});
	check(round, 'recolher e expandir as auxiliares devolve o código idêntico');

	// 2 · com captura: o editor mostra o código gerado
	await page.fill('#codeEdit', '');
	select(['TITULO_principal']);
	project.activeItem = comp; // o script digitado abriu a comp DIGITADA
	await page.evaluate(() => window.BIN.app.capture(true));
	await page.waitForTimeout(500);
	await page.click('.tab[data-tab=code]');
	await page.waitForTimeout(300);
	let txt = await page.inputValue('#codeEdit');
	check(/function criar_titulo_principal/.test(txt) && /⋯ funções auxiliares do BIN/.test(txt) && (await page.textContent('#runTxt')) === 'recriar layer', 'captura: editor com o código gerado e “recriar layer”');

	// edição à mão
	txt = txt.replace("name: 'TITULO_principal'", "name: 'EDITADA'");
	await page.fill('#codeEdit', txt);
	await page.dispatchEvent('#codeEdit', 'input');
	await page.waitForTimeout(200);
	check(await page.isVisible('#codeNote') && (await page.textContent('#runTxt')) === 'executar código editado', 'edição à mão: aviso e “executar código editado”');
	await page.screenshot({ path: path.join(outDir, 'editor-2-editado.png') });
	const before = comp.numLayers;
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done');
	check(comp.numLayers === before + 1 && comp._layers[0].name === 'EDITADA', 'roda o código editado (com as auxiliares de volta)');
	await page.evaluate(() => window.BIN.ui.hideToast());

	// exportar leva o código completo
	await page.click('#exportBtn');
	await page.waitForTimeout(200);
	const saved = await page.evaluate(() => Object.values(window.__saved).pop());
	check(/var bin = \{/.test(saved) && /'EDITADA'/.test(saved) && !/⋯ funções auxiliares/.test(saved), 'exportar: código editado com as auxiliares completas');

	// mudar uma opção não mexe no código editado; descartar volta ao gerado
	await page.click('#optComments');
	check(/'EDITADA'/.test(await page.inputValue('#codeEdit')), 'opções não sobrescrevem o código editado');
	await page.click('#optComments');
	await page.waitForTimeout(4200);
	await page.click('#discardBtn');
	await page.waitForTimeout(200);
	check(!(await page.isVisible('#codeNote')) && /'TITULO_principal'/.test(await page.inputValue('#codeEdit')) && (await page.textContent('#runTxt')) === 'recriar layer', 'descartar edições volta ao código gerado');

	// camadas alinhadas: mesma fonte, espaçamento e rolagem
	const al = await page.evaluate(() => {
		const t = document.getElementById('codeEdit'), p = document.getElementById('codeView');
		const a = getComputedStyle(t), b = getComputedStyle(p);
		t.scrollTop = 300;
		t.dispatchEvent(new Event('scroll'));
		return ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingLeft', 'tabSize', 'whiteSpace'].every((k) => a[k] === b[k]) && Math.abs(p.scrollTop - t.scrollTop) < 1 && Math.abs(document.getElementById('gutter').scrollTop - t.scrollTop) < 1;
	});
	check(al, 'texto e cores alinhados (fonte, espaçamento e rolagem iguais)');

	await browser.close();
	process.exit(failed ? 1 : 0);
})();
