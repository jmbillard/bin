// Gera os ícones do painel (23 px, 4 estados) e o logo do README a partir da marca em SVG.
// uso: node tests/make_icons.js
const { chromium } = require('playwright');
const path = require('path');

const GLYPH = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.5 6.5 1.8 12l4.7 5.5M17.5 6.5l4.7 5.5-4.7 5.5" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2 16.8 12 12 16.8 7.2 12z" fill="${c}"/><path d="M12 4.2v2M12 17.8v2" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></svg>`;

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	const icons = [
		['icon_normal', '#5f6670'], ['icon_rollover', '#2f7bf0'],
		['icon_dark_normal', '#b9bec6'], ['icon_dark_rollover', '#4c9dff']
	];
	for (const [name, color] of icons) {
		await page.setContent(`<body style="margin:0;background:transparent"><div id="i" style="width:23px;height:23px;display:grid;place-items:center">${GLYPH(color).replace('<svg ', '<svg width="19" height="19" ')}</div></body>`);
		await (await page.$('#i')).screenshot({ path: path.join(__dirname, '../bin-cep/icons', name + '.png'), omitBackground: true });
	}
	// logo do README (quadrado em degradê, como no painel)
	const big = await browser.newPage({ deviceScaleFactor: 2 });
	await big.setContent(`<body style="margin:0;background:transparent"><div id="i" style="width:96px;height:96px;border-radius:26px;display:grid;place-items:center;background:linear-gradient(135deg,#4c9dff,#8f7cff)">${GLYPH('#fff').replace('<svg ', '<svg width="60" height="60" ')}</div></body>`);
	await (await big.$('#i')).screenshot({ path: path.join(__dirname, '../docs/img/logo.png'), omitBackground: true });
	await browser.close();
})();
