// Pseudo effects no painel: salvar o .ffx pelo After Effects (Save Animation Preset), escolher um .ffx,
// o script gerado com o .ffx embutido e os avisos.
// uso: node tests/pseudo_panel.js [pasta de saída]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { setup, serve } = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };
const PRESETS = '/Users/teste/Documents/Adobe/After Effects 2026/User Presets';

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
	const { comp, select, ctx } = await setup(page, { theme: 'dark', mode: 'layers' });
	const srv = await serve();
	// o painel lê o .ffx do disco (Node no CEP): aqui, de uma tabela da página
	await page.addInitScript(() => {
		window.__files = {};
		const t = setInterval(() => {
			if (!window.BIN_MOCK) return;
			clearInterval(t);
			window.BIN_MOCK.readBinary = (p) => { if (!window.__files[p]) throw new Error('não existe: ' + p); return Uint8Array.from(window.__files[p], (c) => c.charCodeAt(0)); };
		}, 1);
	});
	const hide = () => page.evaluate(() => window.BIN.ui.hideToast());
	const gen = () => page.evaluate(() => window.BIN.codegen.generate(window.BIN.state.m, Object.assign({}, window.BIN.app.opts())));

	const fx = comp.layer('CONTROLE').property('ADBE Effect Parade').addProperty('Pseudo/BIN Texto');
	fx.property('Pseudo/BIN Texto-0001').setValue(96);
	select(['CONTROLE']);
	await page.goto(srv.url);
	await page.waitForSelector('#propsView:not(.hidden)');
	await hide();
	await page.click('.tab[data-tab=tools]');
	await page.waitForTimeout(200);

	check(await page.isVisible('.pseudo-item') && /BIN Texto/.test(await page.textContent('.pseudo-head')) && /sem \.ffx/.test(await page.textContent('.pseudo-state')), 'aba utilitários: o pseudo effect, sem .ffx ainda');
	let warns = await page.evaluate(() => window.BIN.state.warnings.join(' | '));
	check(/sem o \.ffx, o script só cria o efeito onde ele estiver instalado/.test(warns) && !/var FFX/.test(await gen()), 'aviso e script sem .ffx');
	await page.screenshot({ path: path.join(outDir, 'pseudo-1-sem.png') });

	// salvar: o host abre o Save Animation Preset (simulado) e o painel lê o arquivo
	await page.evaluate((p) => { window.__files[p] = 'RIFX\x00\x00\x10\x00FaFXLISTPseudo/BIN Texto\x00\xff'; }, PRESETS + '/BIN Texto.ffx');
	await page.click('[data-pseudo-save="0"]');
	await page.waitForSelector('.pseudo-item.ok');
	check(/BIN Texto\.ffx · entra no script/.test(await page.textContent('.pseudo-state')), 'salvar .ffx: o item fica pronto, com o nome do arquivo');
	const code = await gen();
	check(/var FFX = \{/.test(code) && /'Pseudo\/BIN Texto': 'RIFX\\x00\\x00\\x10\\x00FaFX/.test(code) && /bin\.pseudo\(effects, 'Pseudo\/BIN Texto'/.test(code), 'o script embute o .ffx e usa bin.pseudo');
	warns = await page.evaluate(() => window.BIN.state.warnings.join(' | '));
	check(!/BIN Texto/.test(warns), 'com o .ffx, nenhum aviso sobre o pseudo effect' + (warns ? ' (restam: ' + warns + ')' : ''));
	await hide();
	await page.screenshot({ path: path.join(outDir, 'pseudo-2-ok.png') });

	// o caminho fica guardado: reabrir o painel mantém o .ffx
	await page.waitForTimeout(300);
	await page.reload();
	await page.waitForSelector('#propsView:not(.hidden)');
	await page.evaluate((p) => { window.__files[p] = 'RIFX\x00\x00\x10\x00FaFXLISTPseudo/BIN Texto\x00\xff'; }, PRESETS + '/BIN Texto.ffx');
	await page.evaluate(() => window.BIN.app.capture(true));
	await page.waitForTimeout(300);
	check(/var FFX = \{/.test(await gen()), 'reabrir o painel: o .ffx continua no script');

	// diálogo cancelado: o painel oferece escolher o arquivo
	ctx.__fs.dialog = null;
	await page.click('.tab[data-tab=tools]');
	await page.click('[data-pseudo-save="0"]');
	await page.waitForSelector('#toast.show');
	check(/salvo fora da pasta de presets \(ou o diálogo foi cancelado\)/.test(await page.textContent('#toast')) && /escolher o \.ffx/.test(await page.textContent('#toast')), 'cancelado: aviso com “escolher o .ffx”');
	await hide();

	// escolher um .ffx que já existe
	await page.evaluate(() => {
		window.__files['/Users/teste/Desktop/meu pseudo.ffx'] = 'RIFX\x00\x00\x10\x00FaFXLISTPseudo/BIN Texto\x00\x01';
		window.BIN_MOCK.openFiles = (t, types) => { window.__types = types; return ['/Users/teste/Desktop/meu pseudo.ffx']; };
	});
	await page.click('[data-pseudo-pick="0"]');
	await page.waitForTimeout(250);
	check(/meu pseudo\.ffx · entra no script/.test(await page.textContent('.pseudo-state')) && (await page.evaluate(() => window.__types.join())) === 'ffx' && /FaFXLISTPseudo\/BIN Texto\\x00\\x01'/.test(await gen()), 'escolher .ffx: diálogo filtrado e o arquivo novo no script');

	await browser.close();
	srv.close();
	process.exit(failed ? 1 : 0);
})();
