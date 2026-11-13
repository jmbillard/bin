// Layout em diferentes tamanhos de painel (estreito na lateral, padrão, largo e baixo embaixo):
// nada rola na horizontal, o chip mostra o nome, o rodapé se adapta e a dica não cobre o filtro.
// uso: node tests/layout_sizes.js [pasta de saída]
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
	for (const [W, H, lang] of [[280, 520, 'es'], [420, 760, 'pt'], [700, 420, 'en']]) {
		const page = await browser.newPage({ viewport: { width: W, height: H } });
		page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
		const { comp, select } = await setup(page, { theme: 'dark', mode: 'layers', lang });
		const srv = await serve();
		const tag = W + '×' + H + ': ';
		const hide = () => page.evaluate(() => window.BIN.ui.hideToast());
		const scrollX = () => page.evaluate(() => {
			const p = document.querySelector('.panel.active');
			return Math.max(document.documentElement.scrollWidth - window.innerWidth, p.scrollWidth - p.clientWidth);
		});
		const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, shown: getComputedStyle(e).display !== 'none' && r.width > 0 }; });

		// tela inicial: sem botão morto na aba propriedades; na aba código o botão volta
		select([]);
		await page.goto(srv.url);
		await page.waitForTimeout(1200);
		const runProps = (await box('#runBtn')).shown;
		const link = await box('#scriptBtn');
		const foot = await box('.foot');
		await page.click('.tab[data-tab=code]');
		const runCode = (await box('#runBtn')).shown;
		await page.click('.tab[data-tab=props]');
		check(!runProps && runCode && link.y + link.h <= foot.y + 1, tag + 'tela inicial inteira visível, sem o botão principal (ele só aparece na aba código)');

		// capturada: chip com o nome legível, sem rolagem horizontal
		select(['TITULO_principal']);
		await page.waitForTimeout(1200);
		await page.click('#captureBtn');
		await page.waitForSelector('#propsView:not(.hidden)');
		await hide();
		const name = await box('#chipName');
		const meta = await page.$eval('#chipMeta', (e) => e.scrollWidth <= e.clientWidth + 1);
		check(name.shown && name.w >= 90 && meta && (await scrollX()) <= 1, tag + 'chip com o nome e as contagens sem cortar; nada rola na horizontal', 'nome ' + Math.round(name.w) + 'px');

		// clicar no filtro e digitar: a dica não aparece em cima dos resultados
		await page.click('#query');
		await page.waitForTimeout(700);
		const tipOnClick = await page.$eval('.tip', (t) => t.classList.contains('show')).catch(() => false);
		await page.keyboard.type('pos');
		await page.waitForTimeout(300);
		const tipTyping = await page.$eval('.tip', (t) => t.classList.contains('show')).catch(() => false);
		check(!tipOnClick && !tipTyping && (await page.$$('.row.leaf.match, .row.match')).length > 0, tag + 'filtrar: a dica do campo não cobre os resultados');
		await page.fill('#query', '');

		// código: contagem de linhas igual à do resumo; opções recolhidas em painel baixo; sem rolagem horizontal da aba
		await page.click('.tab[data-tab=code]');
		await page.waitForTimeout(300);
		const lines = parseInt(await page.textContent('#lineCount'), 10);
		const sum = await page.textContent('#sumText');
		const closed = await page.$eval('#optsBox', (e) => e.classList.contains('closed'));
		const codeH = (await box('#codeBox')).h;
		check(new RegExp('\\b' + lines + '\\b').test(sum) && closed === (H < 640) && codeH >= 120 && (await scrollX()) <= 1, tag + 'código: mesma contagem de linhas do resumo, opções ' + (closed ? 'recolhidas' : 'abertas') + ', editor com ' + Math.round(codeH) + 'px');
		await page.click('#optsHead');
		check((await page.$eval('#optsBox', (e) => e.classList.contains('closed'))) === !closed, tag + 'opções do script abrem e fecham');
		await page.click('#optsHead');

		// rodapé: uma linha no painel largo, duas no resto
		const s = await box('#sum'), r = await box('#runBtn');
		check(W >= 560 ? Math.abs(s.y + s.h / 2 - (r.y + r.h / 2)) < 12 && r.x > s.x : r.y >= s.y + s.h - 1, tag + (W >= 560 ? 'rodapé numa linha só (resumo e botão lado a lado)' : 'rodapé em duas linhas'));

		// utilitários com o caminho da propriedade aberto: nada estoura a largura
		const sh = comp.layer('TITULO_principal');
		sh.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Rect Size').selected = true;
		await page.click('.tab[data-tab=tools]');
		await page.click('#pathBtn');
		await page.waitForSelector('#pathOut:not(.hidden)');
		await page.click('.path-card [data-ups]');
		await page.waitForTimeout(200);
		const over = await page.evaluate(() => [...document.querySelectorAll('#tab-tools *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !e.closest('pre'); }).length);
		check((await scrollX()) <= 1 && over === 0, tag + 'utilitários (caminho com a escada aberta): nada passa da largura');
		await page.screenshot({ path: path.join(outDir, 'layout-' + W + '.png') });

		await page.close();
		srv.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
})();
