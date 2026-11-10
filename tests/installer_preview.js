// Executa "INSTALAR O BIN.jsx" em Node com File/Folder/ScriptUI simulados, confere a instalação
// e desenha cada passo da janela (a partir dos controles que o script cria) em PNG.
// uso: node tests/installer_preview.js [pasta de saída]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
const script = path.resolve(__dirname, '../INSTALAR O BIN.jsx');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-inst-'));
fs.mkdirSync(outDir, { recursive: true });

class Folder {
	constructor(p) { this.fsName = path.resolve(String(p)); }
	get exists() { return fs.existsSync(this.fsName) && fs.statSync(this.fsName).isDirectory(); }
	get name() { return encodeURI(path.basename(this.fsName)); }
	get parent() { return new Folder(path.dirname(this.fsName)); }
	create() { fs.mkdirSync(this.fsName, { recursive: true }); return true; }
	remove() { try { fs.rmdirSync(this.fsName); return true; } catch (e) { return false; } }
	getFiles() { return fs.readdirSync(this.fsName).map((n) => { const p = path.join(this.fsName, n); return fs.statSync(p).isDirectory() ? new Folder(p) : new File(p); }); }
}
Folder.userData = new Folder(userData);
class File {
	constructor(p) { this.fsName = path.resolve(String(p)); }
	get exists() { return fs.existsSync(this.fsName); }
	get name() { return encodeURI(path.basename(this.fsName)); }
	get parent() { return new Folder(path.dirname(this.fsName)); }
	open() { return true; } close() { }
	read() { return fs.readFileSync(this.fsName, 'utf8'); }
	copy(t) { try { fs.copyFileSync(this.fsName, String(t)); return true; } catch (e) { return false; } }
	remove() { fs.unlinkSync(this.fsName); return true; }
}

// ScriptUI: guarda a árvore de controles para desenhar depois
let win;
const buttons = {};
function ctrl(type, text, props) {
	const o = {
		type, text: text === undefined ? '' : text, props: props || {}, visible: true, enabled: true, value: false, children: [],
		orientation: type === 'group' ? 'row' : 'column', preferredSize: { width: 0, height: 0 }, fg: null,
		layout: { layout() { } },
		add(t, b, txt, p) { const c = ctrl(t, txt, p); this.children.push(c); if (t === 'button' || t === 'radiobutton') buttons[txt] = c; return c; },
		addEventListener() { }, center() { }, update() { }, close() { this.closed = true; }, show() { }
	};
	o.graphics = {
		PenType: { SOLID_COLOR: 1 },
		newPen: (t, rgb) => ({ rgb }),
		set foregroundColor(p) { o.fg = p.rgb; },
		get foregroundColor() { return o.fg; }
	};
	return o;
}
const calls = [];
const ctx = {
	$: { os: 'Windows', fileName: script }, File, Folder, decodeURI, encodeURI,
	app: { version: '25.1.0', preferences: { getPrefAsLong: () => (global.__writeBlocked ? 0 : 1) }, executeCommand() { } },
	system: { callSystem: (c) => { calls.push(c); return ''; } },
	Window: function (t, title) { win = ctrl('window', title); return win; }
};
vm.createContext(ctx);
const src = fs.readFileSync(script, 'utf8').replace(/^﻿/, '');
vm.runInContext(src, ctx, { filename: 'INSTALAR O BIN.jsx' });

// banner: a string binária vira PNG de novo
const bannerStr = vm.runInNewContext(src.match(/\tvar BANNER = ('.*');\n/)[1]);
const bannerURL = 'data:image/png;base64,' + Buffer.from(bannerStr, 'latin1').toString('base64');

// ------------------------------------------------------------- desenho --
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const rgb = (c) => 'rgb(' + c.map((x) => Math.round(x * 255)).join(',') + ')';
function width(c) { const p = c.preferredSize; return Array.isArray(p) ? p[0] : p.width; }
function height(c) { const p = c.preferredSize; return Array.isArray(p) ? p[1] : p.height; }

function html(c) {
	if (!c.visible) return '';
	const w = width(c), h = height(c);
	const size = (w > 0 ? 'width:' + w + 'px;' : '') + (h > 0 ? 'min-height:' + h + 'px;' : '');
	const color = c.fg ? 'color:' + rgb(c.fg) + ';' : '';
	switch (c.type) {
		case 'image': return '<img class="banner" src="' + bannerURL + '">';
		case 'statictext': return '<div class="st' + (c.props.truncate ? ' trunc' : '') + '" style="' + size + color + '">' + esc(c.text).replace(/\n/g, '<br>') + '</div>';
		case 'button': return '<span class="btn' + (/começar|próximo|instalar|atualizar|reinstalar|remover|concluir/.test(c.text) && c.text !== 'cancelar' ? ' default' : '') + (c.enabled ? '' : ' dis') + '">' + esc(c.text) + '</span>';
		case 'radiobutton': return '<span class="radio' + (c.value ? ' on' : '') + (c.enabled ? '' : ' dis') + '"><i></i>' + esc(c.text) + '</span>';
		case 'progressbar': return '<div class="bar" style="' + size + '"><b style="width:' + (c.value || 0) + '%"></b></div>';
		default: {
			const kids = c.children.map(html).join('');
			const cls = c.orientation === 'stack' ? 'stack' : c.orientation;
			return '<div class="g ' + cls + (c.alignment === 'right' ? ' right' : '') + (c.alignment === 'left' ? ' left' : '') + '" style="' + (c.spacing !== undefined ? 'gap:' + c.spacing + 'px;' : '') + '">' + kids + '</div>';
		}
	}
}

const CSS = `* { box-sizing: border-box; }
body { margin: 0; background: transparent; font: 12px/1.45 "Segoe UI", Inter, Arial, sans-serif; color: #c8c8c8; }
#stage { display: inline-block; padding: 18px; }
.win { width: 372px; background: #262626; border: 1px solid #111; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.55); overflow: hidden; }
.titlebar { height: 30px; background: #1d1d1d; display: flex; align-items: center; padding: 0 12px; color: #d8d8d8; border-bottom: 1px solid #111; }
.titlebar .dots { display: flex; gap: 7px; margin-right: 10px; } .titlebar .dots i { width: 11px; height: 11px; border-radius: 50%; background: #444; display: block; }
.content { display: flex; flex-direction: column; align-items: center; gap: 14px; padding-bottom: 14px; }
.content > .g { align-self: stretch; padding: 0 14px; }
.banner { display: block; width: 360px; height: 84px; }
.g { display: flex; } .g.row { flex-direction: row; align-items: center; } .g.column { flex-direction: column; align-items: flex-start; }
.g.stack { display: flex; justify-content: space-between; align-items: flex-start; } .g.stack > .g { flex-direction: column; }
.g.right { margin-left: auto; flex-direction: row !important; gap: 8px; } .g.left { flex-direction: row !important; }
.st { white-space: normal; } .st.trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #9a9a9a; }
.radio { display: inline-flex; align-items: center; gap: 6px; }
.radio i { width: 13px; height: 13px; border-radius: 50%; border: 1px solid #8a8a8a; display: inline-block; position: relative; }
.radio.on i::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: #e0e0e0; }
.radio.dis { color: #6a6a6a; } .radio.dis i { border-color: #555; }
.bar { height: 4px; background: #3a3a3a; border-radius: 2px; overflow: hidden; } .bar b { display: block; height: 100%; background: #2d8ceb; }
.btn { background: #3c3c3c; border: 1px solid #545454; color: #e2e2e2; border-radius: 4px; padding: 4px 16px; min-width: 80px; text-align: center; }
.btn.default { border-color: #2d8ceb; box-shadow: inset 0 0 0 1px #2d8ceb; } .btn.dis { opacity: .45; }`;

// caminhos de exemplo (Windows) no lugar das pastas temporárias do teste
const pretty = (h) => h
	.split(userData).join('C:\\Users\\voce\\AppData\\Roaming')
	.split(path.dirname(script)).join('D:\\Downloads\\bin')
	.replace(/(Roaming|bin)((?:\/[\w.-]+)+)/g, (m, a, b) => a + b.replace(/\//g, '\\'));

function page() {
	return pretty('<!doctype html><meta charset="utf-8"><style>' + CSS + '</style><div id="stage"><div class="win"><div class="titlebar"><span class="dots"><i></i><i></i><i></i></span>' + esc(win.text) + '</div><div class="content">' +
		win.children.map(html).join('') + '</div></div></div>');
}

const next = () => {
	const b = Object.values(buttons).find((x) => x.type === 'button' && x.visible !== false && x.text !== 'cancelar' && x.text !== 'anterior' && x.onClick);
	b.onClick();
};

(async () => {
	const browser = await chromium.launch();
	const pg = await browser.newPage({ deviceScaleFactor: 2 });
	const shot = async (name) => {
		await pg.setContent(page());
		await (await pg.$('#stage')).screenshot({ path: path.join(outDir, name + '.png'), omitBackground: true });
	};
	const pageNow = () => win.children[1].children.findIndex((p) => p.visible);
	let flow = true;

	// tudo certo: 'começar' pula a checagem e vai direto para a ação
	await shot('01-instalador-boas-vindas');
	next();
	flow = pageNow() === 2 && flow;
	console.log((pageNow() === 2 ? 'ok    ' : 'FALHA ') + 'tudo certo: começar vai direto para instalar / atualizar');
	await shot('03-instalador-acao');
	buttons['anterior'].onClick(); // a checagem continua a um clique
	flow = pageNow() === 1 && flow;
	console.log((pageNow() === 1 ? 'ok    ' : 'FALHA ') + "a checagem continua acessível em 'anterior'");
	await shot('02-instalador-checagem');
	next();
	next();
	await shot('04-instalador-concluido');
	await browser.close();

	const dest = path.join(userData, 'Adobe/CEP/extensions/com.jmbillard.bin');
	const ok = fs.existsSync(path.join(dest, 'CSXS/manifest.xml')) && fs.existsSync(path.join(dest, 'jsx/host.jsx')) && fs.existsSync(path.join(dest, 'icons/icon_normal.png'));
	// escrita de arquivos bloqueada: 'começar' para na checagem
	global.__writeBlocked = true;
	Object.keys(buttons).forEach((k) => delete buttons[k]);
	vm.runInContext(src, ctx, { filename: 'INSTALAR O BIN.jsx' });
	next();
	const stays = pageNow() === 1 && buttons['começar'].enabled === false; // o botão é criado como 'começar'
	console.log((stays ? 'ok    ' : 'FALHA ') + 'com algo errado: começar para na checagem, sem avançar');
	if (!stays || !flow) process.exitCode = 1;

	// em inglês e espanhol (segue o idioma do After Effects): título, botões e nenhum texto em português
	global.__writeBlocked = false;
	const texts = (c, out = []) => { if (c.text) out.push(c.text); (c.children || []).forEach((k) => texts(k, out)); if (c.helpTip) out.push(c.helpTip); return out; };
	const PT = /\b(não|você|olá|checagens|computador|pasta|começar|próximo|instalador da versão)\b/i;
	const shotLang = async (name) => {
		const b2 = await chromium.launch();
		const pg2 = await b2.newPage({ deviceScaleFactor: 2 });
		await pg2.setContent(page());
		await (await pg2.$('#stage')).screenshot({ path: path.join(outDir, name + '.png'), omitBackground: true });
		await b2.close();
	};
	for (const [iso, lang, start, title] of [['en_US', 'en', 'start', 'installer'], ['es_ES', 'es', 'empezar', 'instalador']]) {
		ctx.app.isoLanguage = iso;
		Object.keys(buttons).forEach((k) => delete buttons[k]);
		vm.runInContext(src, ctx, { filename: 'INSTALAR O BIN.jsx' });
		const all = texts(win).join('\n');
		const left = all.split('\n').filter((l) => PT.test(l));
		const okLang = new RegExp('· ' + title + '$').test(win.text) && !!buttons[start] && !left.length;
		console.log((okLang ? 'ok    ' : 'FALHA ') + 'instalador em ' + lang + ': título, botões e textos traduzidos' + (left.length ? ' · ' + left.slice(0, 4).join(' | ') : ''));
		if (!okLang) process.exitCode = 1;
		await shotLang('instalador-' + lang);
	}
	console.log('janela:', win.text);
	console.log('extensão copiada:', ok ? 'ok' : 'FALHOU', '(' + dest.replace(userData, '<userData>') + ')');
	console.log('PlayerDebugMode:', calls.filter((c) => /PlayerDebugMode/.test(c)).length, 'versões do CSXS');
	fs.rmSync(userData, { recursive: true, force: true });
	process.exit(ok && process.exitCode !== 1 ? 0 : 1);
})();
