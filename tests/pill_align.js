// Mede o alinhamento vertical do texto nas pílulas: acha os pixels do texto dentro de cada
// pílula e compara a sobra acima e abaixo das letras (0 = centralizado).
// uso: node tests/pill_align.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createContext, loadHost } = require('./ae_mock');
const scene = require('./scene');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

const ctx = createContext();
loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
const comp = scene(ctx);

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 4 });
	await page.exposeFunction('__host', (fn, args) => ctx[fn].apply(null, args));
	await page.addInitScript(() => {
		try { localStorage.setItem('bin.settings', JSON.stringify({ theme: 'dark', mode: 'comp' })); } catch (e) { }
		window.BIN_MOCK = { callHost: (fn, args) => window.__host(fn, args) };
	});
	comp._layers.forEach((l) => { l.selected = false; });
	ctx.app.project.activeItem = comp;
	await page.goto('file://' + path.join(__dirname, '../bin-cep/index.html'));
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.waitForTimeout(400);

	const targets = [['chip', '#chipType'], ['comp', '.comp-head .ltype'], ['layer', '.layer-head .ltype'], ['contador', '#propBadge'], ['aviso', '#warnPill span']];
	let worst = 0;
	for (const [label, sel] of targets) {
		const el = await page.$(sel);
		if (!el) { console.log('—', label, '(não encontrado)'); continue; }
		const pill = label === 'aviso' ? await page.$('#warnPill') : el;
		const file = path.join(outDir, 'pill-' + label + '.png');
		await pill.screenshot({ path: file });
		// mede as linhas com tinta do texto (cor bem diferente do fundo da pílula)
		const color = await el.evaluate((e) => getComputedStyle(e).color.match(/\d+/g).slice(0, 3).map(Number));
		const r = await page.evaluate(async ({ src, color }) => {
			const img = new Image();
			await new Promise((ok) => { img.onload = ok; img.src = src; });
			const c = document.createElement('canvas');
			c.width = img.width; c.height = img.height;
			const g = c.getContext('2d');
			g.drawImage(img, 0, 0);
			const d = g.getImageData(0, 0, c.width, c.height).data;
			const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
			const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
			let top = -1, bottom = -1;
			for (let y = 0; y < c.height; y++) {
				for (let x = 0; x < c.width; x++) {
					if (dist(px(x, y), color) < 60) { if (top < 0) top = y; bottom = y; break; }
				}
			}
			return { h: c.height, top, bottom };
		}, { src: 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'), color });
		const above = r.top, below = r.h - 1 - r.bottom;
		const off = (below - above) / 2 / 4; // em px CSS: positivo = texto alto demais
		worst = Math.max(worst, Math.abs(off));
		console.log(`${label.padEnd(9)} acima ${(above / 4).toFixed(2)}px · abaixo ${(below / 4).toFixed(2)}px · desvio ${off >= 0 ? '+' : ''}${off.toFixed(2)}px`);
	}
	console.log('maior desvio:', worst.toFixed(2) + 'px');

	// chip: a pílula com a mesma folga em cima, embaixo e à esquerda, igual à diferença dos raios (curvas concêntricas)
	const g = await page.evaluate(() => {
		const chip = document.getElementById('chip'), pill = document.getElementById('chipType');
		const c = chip.getBoundingClientRect(), t = pill.getBoundingClientRect();
		const R = Math.min(parseFloat(getComputedStyle(chip).borderRadius), c.height / 2);
		const r = Math.min(parseFloat(getComputedStyle(pill).borderRadius), t.height / 2);
		return { top: t.top - c.top, left: t.left - c.left, bottom: c.bottom - t.bottom, d: R - r };
	});
	const conc = Math.abs(g.top - g.left) < 0.5 && Math.abs(g.bottom - g.left) < 0.5 && Math.abs(g.d - g.left) < 0.5;
	console.log((conc ? 'ok    ' : 'FALHA ') + 'chip concêntrico: folgas ' + g.top + ' / ' + g.left + ' / ' + g.bottom + ' px, R − r = ' + g.d + ' px');
	if (!conc) process.exitCode = 1;
	await browser.close();
})();
