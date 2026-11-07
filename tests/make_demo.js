// Grava o uso simulado do painel e converte em GIF (docs/img/demo.gif).
// A gravação headless não mostra o mouse: um cursor desenhado na página acompanha os movimentos e marca os cliques.
// uso: node tests/make_demo.js
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { setup, url, ROOT } = require('./lib_panel');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-demo-'));
const W = 420, H = 760;

(async () => {
	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } } });
	const page = await context.newPage();
	const { select, comp, ctx } = await setup(page, { theme: 'dark', mode: 'layers', target: 'active' });

	// cursor desenhado
	await page.addInitScript(() => {
		window.addEventListener('DOMContentLoaded', () => {
			const c = document.createElement('div');
			c.id = '__cursor';
			c.innerHTML = '<svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 1.5v16.2l4.3-4.1 2.7 6.3 3-1.3-2.7-6.2h6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
			Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 100000, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))', transition: 'transform .12s' });
			document.body.appendChild(c);
			document.addEventListener('mousemove', (e) => { c.style.left = (e.clientX - 2) + 'px'; c.style.top = (e.clientY - 1) + 'px'; }, true);
			document.addEventListener('mousedown', (e) => {
				c.style.transform = 'scale(.85)';
				const r = document.createElement('div');
				Object.assign(r.style, { position: 'fixed', left: (e.clientX - 14) + 'px', top: (e.clientY - 14) + 'px', width: '28px', height: '28px', borderRadius: '50%', border: '2px solid rgba(143,124,255,.9)', zIndex: 99999, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out' });
				document.body.appendChild(r);
				requestAnimationFrame(() => { r.style.transform = 'scale(1.7)'; r.style.opacity = '0'; });
				setTimeout(() => r.remove(), 500);
			}, true);
			document.addEventListener('mouseup', () => { c.style.transform = ''; }, true);
		});
	});

	const w = (ms) => page.waitForTimeout(ms);
	let pos = { x: W / 2, y: H - 120 };
	async function move(sel, steps) {
		const el = await page.waitForSelector(sel, { state: 'attached' });
		// traz o alvo para a tela com rolagem suave e espera parar antes de mirar
		const scrolled = await el.evaluate((e) => {
			const r = e.getBoundingClientRect();
			if (r.top >= 70 && r.bottom <= innerHeight - 140) return false;
			e.scrollIntoView({ block: 'center', behavior: 'smooth' });
			return true;
		});
		if (scrolled) await w(650);
		const b = await el.boundingBox();
		const x = b.x + b.width / 2, y = b.y + b.height / 2;
		await page.mouse.move(x, y, { steps: steps || 16 });
		pos = { x, y };
	}
	async function click(sel, pause) {
		await move(sel);
		await w(180);
		await page.mouse.down(); await w(90); await page.mouse.up();
		await w(pause || 600);
	}
	const hideToast = () => page.evaluate(() => window.BIN.ui.hideToast());
	const row = (name) => 'xpath=//div[contains(@class,"row") and contains(@class,"leaf") and .//span[text()="' + name + '"]]';

	select([]); // abre vazio; a layer é "selecionada no After Effects" antes do clique
	await page.goto(url);
	await page.mouse.move(pos.x, pos.y);
	await w(900);

	// 1 · capturar
	select(['TITULO_principal']);
	await click('#captureBtn', 1300);
	await hideToast();

	// 2 · dica e linha clicável
	await move(row('blend mode'), 18);
	await w(1300);
	await click(row('blend mode'), 700);
	await click(row('blend mode'), 600);

	// 3 · desligar um efeito
	await click('xpath=//div[contains(@class,"card-head")][.//b[text()="effects"]]', 600);
	const glow = 'xpath=//div[contains(@class,"row") and contains(@class,"group") and .//span[text()="Glow"]]';
	await move(glow);
	await w(400);
	await click(glow + '//button[contains(@class,"eye")]', 900);

	// 4 · código
	await click('.tab[data-tab=code]', 900);
	await page.evaluate(() => { document.getElementById('codeBox').scrollTo({ top: 160, behavior: 'smooth' }); });
	await w(1100);
	await click('#targetSeg [data-value=new]', 700);
	await click('#targetSeg [data-value=active]', 600);

	// 5 · recriar
	await click('.tab[data-tab=props]', 500);
	await click('#runBtn', 2200);
	await hideToast();

	// 6 · comp inteira
	ctx.app.project.activeItem = comp;
	await page.evaluate(() => { document.getElementById('tab-props').scrollTo({ top: 0 }); });
	await click('#modeSeg [data-value=comp]', 1300);
	await hideToast();
	await click('xpath=//div[contains(@class,"layer-row") and .//span[text()="CRÉDITO direção"]]', 1400);
	await click('.back', 900);
	await click('#runBtn', 2600);
	await w(600);

	await context.close();
	await browser.close();

	const video = fs.readdirSync(TMP).find((f) => f.endsWith('.webm'));
	const src = path.join(TMP, video);
	const out = path.join(ROOT, 'docs/img/demo.gif');
	const pal = path.join(TMP, 'pal.png');
	execSync(`ffmpeg -y -loglevel error -i "${src}" -vf "fps=10,scale=360:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" "${pal}"`);
	execSync(`ffmpeg -y -loglevel error -i "${src}" -i "${pal}" -lavfi "fps=10,scale=360:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" "${out}"`);
	console.log('gif:', path.relative(ROOT, out), (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
	fs.rmSync(TMP, { recursive: true, force: true });
})();
