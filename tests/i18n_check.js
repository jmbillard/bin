// Traduções: o CSV cobre todos os textos do código (en, es), os marcadores {0} batem, o script gerado em
// inglês e espanhol roda, e o painel em inglês / espanhol não mostra texto em português.
// uso: node tests/i18n_check.js [pasta de saída]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const { collect } = require('./i18n_keys');
const { createContext, loadHost } = require('./ae_mock');
const { setup, serve } = require('./lib_panel');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });
let failed = false;
const check = (ok, label, extra) => { console.log((ok ? 'ok    ' : 'FALHA ') + label + (extra ? ' · ' + extra : '')); if (!ok) failed = true; };

const CSV = fs.readFileSync(path.join(__dirname, '../bin-cep/i18n/textos.csv'), 'utf8');
const I18N = require('../bin-cep/js/i18n.js');
const LANGS = ['en', 'es'];

(async () => {
	// ------------------------------------------------------------ o CSV --
	const rows = I18N.parse(CSV);
	const head = rows[0];
	const n = I18N.load(CSV);
	const keys = collect();
	const missing = [], empty = [], marks = [], dup = {};
	rows.slice(1).forEach((r) => { const k = r[0]; dup[k] = (dup[k] || 0) + 1; });
	Object.keys(keys).forEach((k) => {
		const e = I18N.table[k];
		if (!e) { missing.push(k + ' (' + keys[k].join(', ') + ')'); return; }
		LANGS.forEach((l) => {
			if (!e[l]) empty.push(l + ': ' + k);
			else {
				const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
				if (ph(e[l]) !== ph(k)) marks.push(l + ': ' + k);
			}
		});
	});
	const dups = Object.keys(dup).filter((k) => dup[k] > 1);
	check(head.join() === 'pt,en,es' && n > 300, 'CSV: colunas pt, en, es', n + ' textos');
	check(!missing.length, 'todo texto do código está no CSV', missing.slice(0, 8).join(' | '));
	check(!empty.length, 'inglês e espanhol preenchidos', empty.slice(0, 8).join(' | '));
	check(!marks.length, 'os mesmos {0}, {1}… em cada idioma', marks.slice(0, 8).join(' | '));
	check(!dups.length, 'sem textos repetidos', dups.join(' | '));
	const unused = Object.keys(I18N.table).filter((k) => !keys[k]);
	check(!unused.length, 'sem linhas sobrando no CSV (texto que saiu do código)', unused.slice(0, 8).join(' | '));

	// tradução de mensagem já montada (vinda do After Effects)
	I18N.set('en');
	check(I18N.tr('não foi possível ler "Contents › Grupo 1": falhou') === 'could not read "Contents › Grupo 1": falhou' && I18N.t('comp “{0}” capturada.', 'X') === 'comp “X” captured.', 'mensagem do host traduzida pelo modelo; {0} preenchido');

	// ------------------------------------------------- o script gerado --
	const CG = require('../bin-cep/js/codegen.js');
	for (const lang of LANGS) {
		I18N.set(lang);
		let ok = true, why = '';
		try { new vm.Script('(function(){' + CG.helpers() + '})'); } catch (e) { ok = false; why = e.message; }
		const ctx = createContext();
		loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
		const comp = require('./scene')(ctx);
		comp._layers.forEach((l) => { l.selected = true; });
		const code = CG.generate(CG.prepare(JSON.parse(ctx.bin_captureComp())), { target: 'new' });
		ctx.$.global.BIN_PANEL = true;
		ctx.$.global.BIN_LAST = null;
		try { vm.runInContext(code, ctx); } catch (e) { ok = false; why = e.message; }
		const last = ctx.$.global.BIN_LAST;
		const fn = lang === 'en' ? /function create_comp_abertura_v03\(\)/ : /function crear_comp_abertura_v03\(\)/;
		const word = lang === 'en' ? /\/\/ ---- BIN: helper functions/ : /\/\/ ---- BIN: funciones auxiliares/;
		check(ok && last && last.ok && !last.errors.length && fn.test(code) && word.test(code) && !/gerado em|funções auxiliares|parentesco/.test(code),
			'script gerado em ' + lang + ': roda, com funções e comentários traduzidos', why);
		fs.writeFileSync(path.join(outDir, 'i18n-' + lang + '.jsx'), code);
	}
	I18N.set('pt');

	// ---------------------------------------------------------- o painel --
	const browser = await chromium.launch();
	// palavras que denunciam português (sem as que existem igual no idioma de destino)
	const PT = {
		en: /[ãõçâêô]|ção\b|ções\b|\b(não|clique|selecione|capturar|recriar|propriedades|utilitários|código|aviso|salvar|nenhum|abrir|exportar|copiar|aba)\b/i,
		es: /[ãõ]|ção\b|ções\b|\b(não|clique|selecione|recriar|propriedades|utilitários|nenhum|salvar|layers?|aba|você)\b/i
	};
	const SCENE = /CRÉDITO|direção|TITULO|ABERTURA|CTRL|CONTROLE|PRE logo|PRE icone|MATTE|Luz|Camera 1|bolinha|circulo|Barra|Fade|amp|“Bia”|Ávila/;
	for (const lang of LANGS) {
		const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
		page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
		const { select } = await setup(page, { theme: 'dark', mode: 'layers', lang });
		const srv = await serve();
		select(['TITULO_principal', 'CRÉDITO direção']);
		await page.goto(srv.url);
		await page.waitForSelector('#propsView:not(.hidden)');
		await page.waitForTimeout(300);
		const leftovers = new Set();
		const scan = async (where) => {
			const found = await page.evaluate((keys) => {
				const out = [];
				const vis = (el) => !!(el.offsetParent || el === document.body) && getComputedStyle(el).visibility !== 'hidden';
				const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				let n;
				while ((n = w.nextNode())) {
					const t = n.nodeValue.trim();
					if (t && n.parentElement && vis(n.parentElement) && !/^(PRE|TEXTAREA)$/.test(n.parentElement.nodeName) && !n.parentElement.closest('pre')) out.push(t);
				}
				document.querySelectorAll('[title],[data-tip],[placeholder]').forEach((el) => ['title', 'data-tip', 'placeholder'].forEach((a) => { if (el.getAttribute(a)) out.push(el.getAttribute(a)); }));
				return out;
			});
			found.forEach((t) => t.split('\n').forEach((line) => {
				const l = line.replace(/^• /, '').trim();
				if (!l || SCENE.test(l)) return;
				if ((I18N.table[l] && I18N.table[l][lang] && I18N.table[l][lang] !== l) || PT[lang].test(l)) leftovers.add(where + ': ' + l);
			}));
		};
		await scan('propriedades');
		await page.evaluate(() => window.BIN.ui.hideToast());
		await page.click('.tab[data-tab=code]');
		await page.waitForTimeout(250);
		await scan('código');
		await page.click('.tab[data-tab=tools]');
		await page.waitForTimeout(250);
		await scan('utilitários');
		await page.click('.tab[data-tab=props]');
		await page.click('#modeSeg [data-value=comp]');
		await page.waitForFunction(() => document.getElementById('chipType').textContent === 'COMP');
		await page.waitForTimeout(250);
		await scan('comp inteira');
		await page.click('#warnPill');
		await page.waitForTimeout(150);
		await scan('avisos');
		check(!leftovers.size, 'painel em ' + lang + ': nenhum texto em português', [...leftovers].slice(0, 10).join(' | '));
		await page.evaluate(() => window.BIN.ui.hideToast());
		await page.screenshot({ path: path.join(outDir, 'i18n-' + lang + '.png') });
		await page.close();
		srv.close();
	}

	// troca pelo botão e detecção pelo idioma do After Effects
	{
		const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
		page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
		const { ctx, select } = await setup(page, { theme: 'dark', mode: 'layers' });
		ctx.app.isoLanguage = 'es_ES';
		const srv = await serve();
		select(['TITULO_principal']);
		await page.goto(srv.url);
		await page.waitForFunction(() => document.getElementById('langTxt').textContent === 'ES', null, { timeout: 4000 }).catch(() => { });
		check((await page.textContent('#langTxt')) === 'ES' && /recrear capa/.test(await page.textContent('#runTxt')) && (await page.getAttribute('html', 'lang')) === 'es', 'primeira vez: segue o idioma do After Effects (es_ES)');
		await page.click('#langBtn');
		await page.waitForTimeout(150);
		const pt = { lang: await page.textContent('#langTxt'), run: await page.textContent('#runTxt'), tab: await page.textContent('.tab[data-tab=props] span') };
		await page.click('#langBtn');
		await page.waitForTimeout(150);
		const en = { lang: await page.textContent('#langTxt'), run: await page.textContent('#runTxt'), tab: await page.textContent('.tab[data-tab=props] span') };
		check(pt.lang === 'PT' && pt.run === 'recriar layer' && pt.tab === 'propriedades' && en.lang === 'EN' && en.run === 'recreate layer' && en.tab === 'properties', 'botão de idioma: ES → PT → EN, e o painel inteiro troca');
		await page.reload();
		await page.waitForSelector('#propsView:not(.hidden)');
		check((await page.textContent('#langTxt')) === 'EN', 'o idioma escolhido fica guardado');
		await page.close();
		srv.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
})();
