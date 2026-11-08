// Tooltips (mesmo estilo do ABRIDOR) e atalhos de teclado do painel.
// Passa o mouse em alguns elementos, confere o conteúdo e a posição da dica e tira capturas.
// uso: node tests/tooltips.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createContext, loadHost } = require('./ae_mock');
const scene = require('./scene');
const lib = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

const ctx = createContext();
loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
const comp = scene(ctx);
comp._layers.forEach((l) => { l.selected = l.name === 'CRÉDITO direção' || l.name === 'TITULO_principal'; });

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
	await page.exposeFunction('__host', (fn, a) => ctx[fn].apply(null, a));
	await page.addInitScript(() => {
		try { localStorage.setItem('bin.settings', JSON.stringify({ theme: 'dark', mode: 'layers' })); } catch (e) { }
		window.BIN_MOCK = { callHost: (f, a) => window.__host(f, a), saveFile: (t, n) => '/tmp/' + n, writeText: () => { } };
	});
	await page.goto('file://' + path.join(__dirname, '../bin-cep/index.html'));
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.waitForTimeout(500);
	await page.evaluate(() => window.BIN.ui.hideToast());

	const tipOf = () => page.evaluate(() => {
		const t = document.getElementById('tip');
		const r = t.getBoundingClientRect();
		return {
			show: t.classList.contains('show'), up: t.classList.contains('up'),
			head: (t.querySelector('.tip-head span') || {}).textContent, kbd: [...t.querySelectorAll('kbd')].map((k) => k.textContent).join('+'),
			body: [...t.querySelectorAll('.tip-body')].map((b) => b.textContent), list: [...t.querySelectorAll('.tip-list li')].map((b) => b.textContent),
			inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
		};
	});
	async function hover(sel, name) {
		await page.mouse.move(2, 2);
		await page.waitForTimeout(650); // esfria o modo "aquecido"
		await page.hover(sel);
		await page.waitForTimeout(800);
		const t = await tipOf();
		await page.screenshot({ path: path.join(outDir, 'tip-' + name + '.png') });
		return t;
	}

	let t = await hover('.tab[data-tab=code]', 'aba');
	check(t.show && t.head === 'código' && t.kbd === '2' && t.body.length === 1 && t.inside, 'aba: título, descrição e atalho "2"');

	t = await hover('#optKeys', 'keyframes');
	check(t.show && t.head === 'keyframes' && t.list.length === 2, 'toggle de keyframes: lista com ligado / desligado');

	// com duas layers os cards começam fechados: abre o transform do título
	await page.click('xpath=(//div[contains(@class,"card-head")][.//b[text()="transform"]])[1]');
	await page.waitForTimeout(200);
	t = await hover('xpath=(//div[contains(@class,"row") and contains(@class,"leaf") and .//span[text()="Position"]])[1]', 'propriedade');
	check(t.show && t.head === 'Position' && t.body[0] === 'ADBE Position' && t.list.some((l) => /3 keyframes/.test(l)) && t.inside, 'propriedade: matchName e keyframes');

	t = await hover('#warnPill', 'avisos');
	check(t.show && t.list.length >= 1 && /fonte/.test(t.list.join(' ')) && t.inside, 'avisos: a dica lista os avisos');

	t = await hover('#runBtn', 'recriar');
	check(t.show && t.kbd === 'Ctrl+Enter', 'recriar: atalho Ctrl + Enter');
	// no Mac: símbolo junto do nome da tecla
	const mac = await browser.newPage({ viewport: { width: 420, height: 760 } });
	await mac.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
	await lib.setup(mac, { theme: 'dark', mode: 'layers' });
	await mac.goto(lib.url);
	await mac.waitForTimeout(400);
	const macKbd = await mac.evaluate(() => {
		const b = document.getElementById('runBtn');
		b.disabled = false;
		return new Promise((ok) => { b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); setTimeout(() => ok([...document.querySelectorAll('.tip kbd')].map((k) => k.textContent).join(' + ')), 900); });
	});
	check(macKbd === '⌘ Cmd + ↩ Enter', 'Mac: atalho com símbolo e nome (' + macKbd + ')');
	await mac.close();

	// modo aquecido: a próxima dica aparece quase sem espera
	await page.click('.tab[data-tab=code]');
	await page.mouse.move(2, 2);
	await page.waitForTimeout(650);
	await page.hover('#copyBtn');
	await page.waitForTimeout(700);
	await page.hover('#exportBtn');
	await page.waitForTimeout(120);
	t = await tipOf();
	check(t.show && t.head === 'exportar .jsx', 'modo aquecido: a dica seguinte aparece sem espera');

	// atalhos
	await page.mouse.move(2, 2);
	await page.keyboard.press('1');
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'props', 'atalho 1: aba propriedades');
	await page.keyboard.press('3');
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'tools', 'atalho 3: aba utilitários');
	await page.keyboard.press('Control+f');
	check(await page.evaluate(() => document.activeElement.id === 'query' && document.querySelector('.tab.active').dataset.tab === 'props'), 'Ctrl+F: foco no filtro');
	await page.keyboard.type('scale');
	await page.waitForTimeout(150);
	await page.keyboard.press('2'); // digitando no filtro: não troca de aba
	check(await page.$eval('.tab.active', (e) => e.dataset.tab) === 'props', 'digitar no filtro não troca de aba');
	await page.keyboard.press('Escape');
	check(await page.$eval('#query', (e) => e.value) === '', 'Esc limpa o filtro');
	const before = comp.numLayers;
	await page.keyboard.press('Control+Enter');
	await page.waitForSelector('#runBtn.done', { timeout: 5000 });
	check(comp.numLayers === before + 2, 'Ctrl+Enter recria');

	// tema claro
	await page.evaluate(() => window.BIN.ui.hideToast());
	await page.click('#themeBtn');
	await page.waitForTimeout(600);
	t = await hover('.tab[data-tab=tools]', 'claro');
	check(t.show && t.list.length === 2, 'tema claro: dica com lista');

	await browser.close();
	process.exit(failed ? 1 : 0);
})();
