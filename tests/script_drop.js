// Abrir script no editor: arrastar o arquivo para o painel ou usar o botão "abrir script".
// uso: node tests/script_drop.js [pasta de saída]
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
	const toast = () => page.textContent('#toast');
	const hide = () => page.evaluate(() => window.BIN.ui.hideToast());

	// arrasta arquivos (nome, conteúdo em bytes) até o seletor e solta
	async function drag(sel, files, opts) {
		opts = opts || {};
		const dt = await page.evaluateHandle((files) => {
			const d = new DataTransfer();
			files.forEach((f) => d.items.add(new File([new Uint8Array(f.bytes)], f.name)));
			return d;
		}, files.map((f) => ({ name: f.name, bytes: Array.from(Buffer.from(f.text, f.enc || 'utf8')) })));
		await page.dispatchEvent(sel, 'dragenter', { dataTransfer: dt });
		await page.dispatchEvent(sel, 'dragover', { dataTransfer: dt });
		const shown = await page.evaluate(() => document.body.classList.contains('dragging'));
		if (opts.shot) await page.screenshot({ path: path.join(outDir, opts.shot) });
		await page.dispatchEvent(sel, 'drop', { dataTransfer: dt });
		await page.waitForTimeout(250);
		return shown;
	}

	// 1 · sem captura, na tela inicial: o script abre no editor
	select([]);
	await page.goto(srv.url);
	await page.waitForTimeout(400);
	const shown = await drag('#empty', [{ name: 'meu_script.jsx', text: '﻿var c = app.project.items.addComp("SOLTA", 100, 100, 1, 1, 24);\r\nc.openInViewer();\r\n' }], { shot: 'drop-1-arrastando.png' });
	check(shown, 'arrastar um arquivo mostra a área de soltar');
	check(!(await page.evaluate(() => document.body.classList.contains('dragging'))), 'soltar esconde a área');
	const ed = await page.inputValue('#codeEdit');
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'code' && /addComp\("SOLTA"/.test(ed) && !/\r|﻿/.test(ed), 'o script abre na aba código (sem BOM nem \\r)');
	check((await page.textContent('#fileName')) === 'meu_script.jsx' && /meu_script\.jsx/.test(await toast()) && (await page.textContent('#runTxt')) === 'executar script', 'nome do arquivo na barra e “executar script”');
	await page.screenshot({ path: path.join(outDir, 'drop-2-aberto.png') });
	await hide();
	await page.waitForTimeout(3000);

	// 2 · Windows-1252 (script antigo) vira texto certo
	await drag('#codeBox', [{ name: 'antigo.js', text: 'alert("ação");', enc: 'latin1' }]);
	check(/alert\("ação"\)/.test(await page.inputValue('#codeEdit')) && (await page.textContent('#fileName')) === 'antigo.jsx', 'arquivo em Windows-1252 abre com os acentos certos');
	await hide();

	// 3 · arquivo que não é script: aviso, o editor fica igual
	await drag('#codeBox', [{ name: 'logo.png', text: 'PNG' }]);
	check(/só scripts abrem/.test(await toast()) && /ação/.test(await page.inputValue('#codeEdit')), 'arquivo que não é script: aviso e nada muda');
	await hide();
	await drag('#codeBox', [{ name: 'x.jsxbin', text: '@JSXBIN@ES@2.0@' }]);
	check(/jsxbin é compilado/.test(await toast()), '.jsxbin: aviso próprio');
	await hide();

	// 4 · nos utilitários, soltar fora da área do binário não abre nada
	await page.click('.tab[data-tab=tools]');
	const shownTools = await drag('#tab-tools', [{ name: 'outro.jsx', text: 'var nada;' }]);
	check(!shownTools && await page.$eval('.tab.active', (e) => e.dataset.tab) === 'tools' && /ação/.test(await page.inputValue('#codeEdit')), 'utilitários: script solto fora do binário é ignorado');

	// 4b · arquivo → binário: grande demais vira aviso (a string ficaria ~4× maior e travaria o painel)
	const bigMsg = await page.evaluate(() => new Promise((ok) => {
		const d = new DataTransfer();
		d.items.add(new File([new Uint8Array(21 * 1024 * 1024)], 'video.mov'));
		const drop = document.getElementById('binDrop');
		drop.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true, cancelable: true }));
		setTimeout(() => ok({ toast: document.getElementById('toast').textContent, out: !document.getElementById('binOut').classList.contains('hidden') }), 300);
	}));
	check(/“video\.mov” tem 21,0 MB: grande demais para virar string \(o limite é 20,0 MB\)/.test(bigMsg.toast) && !bigMsg.out, 'arquivo → binário: arquivo grande demais vira aviso, sem travar');
	await page.evaluate(() => window.BIN.ui.hideToast());

	// 5 · com captura: o script entra como código editado; descartar volta ao gerado
	await page.click('.tab[data-tab=props]');
	select(['TITULO_principal']);
	await page.evaluate(() => window.BIN.app.capture(true));
	await page.waitForTimeout(500);
	await hide();
	await drag('#tab-props', [{ name: 'colado.jsxinc', text: 'var x = 1;' }]);
	check((await page.inputValue('#codeEdit')) === 'var x = 1;' && await page.isVisible('#codeNote') && (await page.textContent('#runTxt')) === 'executar código editado' && (await page.textContent('#fileName')) === 'colado.jsx', 'com captura: abre como código editado');
	await hide();
	await page.click('#discardBtn');
	await page.waitForTimeout(200);
	check(/function criar_titulo_principal/.test(await page.inputValue('#codeEdit')) && /criar_titulo_principal\.jsx/.test(await page.textContent('#fileName')), 'descartar volta ao gerado (e ao nome gerado)');

	// 6 · botão abrir script (diálogo) e Ctrl+O
	await page.evaluate(() => {
		window.BIN_MOCK.openFiles = (t, types) => { window.__types = types; return ['/projetos/ferramentas/do_dialogo.jsx']; };
		window.BIN_MOCK.readBinary = () => new TextEncoder().encode('// veio do diálogo\nvar y = 2;');
	});
	await page.click('#openBtn');
	await page.waitForTimeout(300);
	check(/veio do diálogo/.test(await page.inputValue('#codeEdit')) && (await page.textContent('#fileName')) === 'do_dialogo.jsx' && (await page.evaluate(() => window.__types.join(','))) === 'jsx,js,jsxinc,txt', 'botão abrir: diálogo filtrado por tipo de script');
	await hide();
	await page.click('#discardBtn');
	await page.click('.tab[data-tab=props]');
	await page.keyboard.press('Control+o');
	await page.waitForTimeout(300);
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'code' && /veio do diálogo/.test(await page.inputValue('#codeEdit')), 'Ctrl+O abre o script de qualquer aba');

	// 7 · roda o script aberto
	await hide();
	await page.fill('#codeEdit', 'var c = app.project.items.addComp("ABERTA", 100, 100, 1, 1, 24);');
	await page.dispatchEvent('#codeEdit', 'input');
	await page.click('#runBtn');
	await page.waitForSelector('#runBtn.done');
	check(/script executado/.test(await toast()), 'o script aberto roda');

	await browser.close();
	srv.close();
	process.exit(failed ? 1 : 0);
})();
