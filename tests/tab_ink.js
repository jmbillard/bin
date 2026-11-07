// Confere que o fundo da aba ativa cobre a aba inteira depois da captura (o contador muda a largura da aba)
// e que o conteúdo tem folga das bordas desse fundo.
// uso: node tests/tab_ink.js
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { createContext, loadHost } = require('./ae_mock');
const scene = require('./scene');

const ctx = createContext();
loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
const comp = scene(ctx);
comp._layers.forEach((l) => { l.selected = l.name === 'TITULO_principal'; });

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
	await page.exposeFunction('__host', (fn, a) => ctx[fn].apply(null, a));
	await page.addInitScript(() => {
		try { localStorage.setItem('bin.settings', JSON.stringify({ theme: 'dark', mode: 'layers' })); } catch (e) { }
		window.BIN_MOCK = { callHost: (f, a) => window.__host(f, a) };
	});
	await page.goto('file://' + path.join(__dirname, '../bin-cep/index.html'));
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.waitForTimeout(700); // transição do fundo
	let failed = false;
	// 'inicial' = logo depois da captura, sem clicar em nada (o contador acabou de aparecer)
	for (const tab of ['inicial', 'code', 'tools', 'props']) {
		if (tab !== 'inicial') {
			await page.click('.tab[data-tab=' + tab + ']');
			await page.waitForTimeout(700);
		}
		const r = await page.evaluate(() => {
			const t = document.querySelector('.tab.active').getBoundingClientRect();
			const ink = document.querySelector('.tab-ink').getBoundingClientRect();
			const kids = [...document.querySelector('.tab.active').children].map((c) => c.getBoundingClientRect()).filter((b) => b.width);
			return { dl: ink.left - t.left, dr: ink.right - t.right, left: kids[0].left - ink.left, right: ink.right - kids[kids.length - 1].right };
		});
		const ok = Math.abs(r.dl) < 1 && Math.abs(r.dr) < 1 && r.left >= 12 && r.right >= 12;
		if (!ok) failed = true;
		console.log((ok ? 'ok    ' : 'FALHA ') + tab.padEnd(8) + ` fundo ${r.dl.toFixed(1)} / ${r.dr.toFixed(1)} px da aba · folga do conteúdo ${r.left.toFixed(1)} / ${r.right.toFixed(1)} px`);
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
})();
