// Micro animações: cada ícone clicável faz um gesto pequeno no hover, sem quebrar estados
// (chevron fechado, aba ativa); rolagem com sombra; "reduzir movimento" desliga tudo.
// uso: node tests/micro_anim.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { setup, serve } = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };

async function open(browser, opts) {
	const page = await browser.newPage(Object.assign({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 }, opts || {}));
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
	const { select } = await setup(page, { theme: 'dark', mode: 'layers' });
	const srv = await serve();
	select(['TITULO_principal']);
	await page.goto(srv.url);
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.evaluate(() => window.BIN.ui.hideToast());
	return { page, srv };
}

// ícone dentro do alvo (CSS ou XPath)
const inside = (host, ico) => host.startsWith('xpath=') ? host + '//*[contains(@class,"' + ico.slice(1) + '")]' : host + ' ' + ico;
const angle = (t) => { const m = t.match(/matrix\(([^)]+)\)/); if (!m) return 0; const v = m[1].split(',').map(Number); return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI); };

// transform do ícone depois do hover (transições terminadas)
async function after(page, host, ico, wait) {
	await page.mouse.move(1, 1);
	await page.waitForTimeout(450);
	await page.hover(host);
	await page.waitForTimeout(wait || 500);
	return page.$eval(inside(host, ico), (e) => getComputedStyle(e).transform);
}
async function animName(page, host, ico) {
	await page.mouse.move(1, 1);
	await page.waitForTimeout(450);
	await page.hover(host);
	await page.waitForTimeout(60);
	return page.$eval(inside(host, ico), (e) => getComputedStyle(e).animationName);
}

(async () => {
	const browser = await chromium.launch();
	const { page, srv } = await open(browser);

	check((await page.$$eval('#chip .i-refresh path', (p) => p.length)) === 4, 'atualizar: duas setas (dois arcos + duas pontas)');
	const rot = await after(page, '#chip', '.i-refresh');
	check(/^matrix\(-1, [0-9.e-]+, [0-9.e-]+, -1/.test(rot), 'hover no chip: as setas dão meia volta');

	const play = await after(page, '#runBtn', '.i-play');
	check(/matrix\(1, 0, 0, 1, 2, 0\)/.test(play), 'play: avança 2 px');
	check(await animName(page, '#helpBtn', '.i-help') === 'ico-wiggle', 'ajuda: balança');

	// aba ativa mantém a escala no hover
	const tab = await after(page, '.tab[data-tab=props]', '.i-layers');
	const m = tab.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
	check(Math.abs(m[0] - 1.12) < 0.01 && m[5] < -1, 'aba ativa: sobe sem perder o destaque (escala 1.12)');

	// chevron de card fechado continua virado no hover
	await page.click('xpath=//div[contains(@class,"card-head")][.//b[text()="contents"]]');
	await page.waitForTimeout(400);
	const chev = await after(page, 'xpath=//div[contains(@class,"card-head")][.//b[text()="contents"]]', '.i-chevron');
	check(angle(chev) === -90, 'card fechado: o chevron continua virado no hover (' + angle(chev) + '°)');

	// olho só pisca no próprio botão, não ao passar pela linha
	const row = 'xpath=(//div[contains(@class,"row") and contains(@class,"leaf")])[1]';
	await page.mouse.move(1, 1);
	await page.waitForTimeout(300);
	await page.hover(row);
	await page.waitForTimeout(40);
	const rowEye = await page.$eval(row + '//*[contains(@class,"i-eye")]', (e) => getComputedStyle(e).animationName).catch(() => 'sem olho');
	check(rowEye === 'none' || rowEye === 'sem olho', 'passar pela linha não faz o olho piscar');

	// rolagem: sombra sob as abas
	check(!(await page.$eval('main', (e) => e.classList.contains('scrolled'))), 'sem rolar: sem sombra');
	await page.evaluate(() => { const p = document.getElementById('tab-props'); p.scrollTop = 120; p.dispatchEvent(new Event('scroll')); });
	await page.waitForTimeout(350);
	check(await page.$eval('main', (e) => e.classList.contains('scrolled') && getComputedStyle(e, '::before').opacity === '1'), 'rolado: sombra sob as abas');
	await page.screenshot({ path: path.join(outDir, 'anim-rolado.png') });
	await page.click('.tab[data-tab=code]');
	await page.waitForTimeout(100);
	check(!(await page.$eval('main', (e) => e.classList.contains('scrolled'))), 'trocar para uma aba no topo: a sombra some');

	// copiar e exportar: gestos em dois tempos
	check(await animName(page, '#copyBtn', '.i-copy') === 'ico-copy' && await animName(page, '#exportBtn', '.i-save') === 'ico-drop', 'copiar desloca a folha; exportar afunda a seta');
	await page.close(); srv.close();

	// reduzir movimento: nada se mexe
	const r = await open(browser, { reducedMotion: 'reduce' });
	const still = await after(r.page, '#chip', '.i-refresh', 100);
	check(still === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(still) || /^matrix\(-1/.test(still), 'reduzir movimento: sem transição (' + still + ')');
	const an = await animName(r.page, '#helpBtn', '.i-help');
	check(an === 'none', 'reduzir movimento: sem animação (' + an + ')');
	await r.page.close(); r.srv.close();

	await browser.close();
	process.exit(failed ? 1 : 0);
})();
