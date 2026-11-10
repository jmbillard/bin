// Textos que precisam estar em bin-cep/i18n/textos.csv, achados no código:
//  - JS do painel e do gerador: primeiro argumento de T(...) (inclusive ternários), palavras do plural(),
//    o "o quê" do copyText() e os valores das tabelas de rótulos;
//  - HTML: textos e atributos title / placeholder / aria-label;
//  - auxiliares do script gerado: textos entre aspas e comentários em português;
//  - host.jsx: mensagens de erro / aviso e modelos bin_f(...);
//  - mensagens montadas no cep.js (lista abaixo);
//  - instalador: L('...') em INSTALAR O BIN.jsx.
// uso: node tests/i18n_keys.js  (lista as chaves)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// lê uma string JS a partir de src[i] (aspas simples ou duplas); devolve [valor, fim]
function readString(src, i) {
	const q = src[i];
	let out = '', j = i + 1;
	for (; j < src.length && src[j] !== q; j++) {
		if (src[j] === '\\') {
			const c = src[++j];
			out += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'u' ? String.fromCharCode(parseInt(src.substr(j + 1, 4), 16)) + ((j += 4), '') : c;
		} else out += src[j];
	}
	return [out, j + 1];
}

// argumentos (como trechos de código) de uma chamada que começa em src[open] === '('
function callArgs(src, open) {
	const args = [];
	let depth = 0, start = open + 1;
	for (let i = open; i < src.length; i++) {
		const c = src[i];
		if (c === "'" || c === '"') { i = readString(src, i)[1] - 1; continue; }
		if (c === '(' || c === '[' || c === '{') depth++;
		else if (c === ')' || c === ']' || c === '}') {
			depth--;
			if (depth === 0) { args.push(src.slice(start, i)); return args; }
		} else if (c === ',' && depth === 1) { args.push(src.slice(start, i)); start = i + 1; }
	}
	return args;
}

function literals(code) {
	const out = [];
	for (let i = 0; i < code.length; i++) {
		if (code[i] === "'" || code[i] === '"') { const [v, end] = readString(code, i); out.push(v); i = end - 1; }
	}
	return out;
}

// chamadas nome(...) no código: lista dos argumentos de cada uma
function calls(src, name) {
	const re = new RegExp('(^|[^\\w.$])' + name.replace(/\./g, '\\.') + '\\(', 'g');
	const out = [];
	let m;
	while ((m = re.exec(src))) out.push(callArgs(src, m.index + m[0].length - 1));
	return out;
}

// condições de ternário com comparação ('a' === x ? …) não são texto
const CODE = /^(comp|layers|tools|props|code|expr|pseudo|Pseudo\/.*)$/;

function fromJS(file, keys) {
	const src = read(file);
	calls(src, 'T').concat(calls(src, 'BIN.t'), calls(src, 'global.BIN.t')).forEach((a) => {
		literals(a[0] || '').forEach((v) => { if (!CODE.test(v)) add(keys, v, file); });
	});
	calls(src, 'plural').forEach((a) => [a[1], a[2]].forEach((x) => literals(x || '').forEach((v) => add(keys, v, file))));
	calls(src, 'copyText').forEach((a) => literals(a[1] || '').forEach((v) => { if (!CODE.test(v)) add(keys, v, file); }));
}

// tabelas de rótulos do app.js (traduzidas no uso)
function fromTables(keys) {
	const src = read('bin-cep/js/app.js');
	['TYPE_LABEL', 'TYPE_NAME', 'ATTR_LABEL', 'COMP_LABEL', 'THEME_LABEL', 'GROUP_TITLE'].forEach((name) => {
		const m = new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\n?\\t?\\});').exec(src);
		if (!m) throw new Error('tabela não encontrada: ' + name);
		const obj = vm.runInNewContext('(' + m[1] + ')');
		Object.keys(obj).forEach((k) => {
			const v = obj[k];
			add(keys, Array.isArray(v) ? v[0] : v, 'app.js · ' + name);
		});
	});
}

function decode(s) {
	return s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
}

function fromHTML(keys) {
	const html = read('bin-cep/index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
	let m;
	const text = />([^<]+)</g;
	while ((m = text.exec(html))) {
		const t = decode(m[1]).trim();
		if (t && /[a-zà-ú]/i.test(t) && !/^(BIN|PT|SHAPE|ƒ)$/.test(t)) add(keys, t, 'index.html');
	}
	const attr = /\s(title|placeholder|aria-label)="([^"]*)"/g;
	while ((m = attr.exec(html))) { const t = decode(m[2]); if (t.trim()) add(keys, t, 'index.html'); }
}

// auxiliares do script: comentários e textos em português (o resto é código)
const PT = /[ãõçáéíóúâêôà]|\b(não|nesta|layer|propriedade|comp|arquivo|efeito|aviso|expressão|faltando|selecione|abra)\b/i;
function fromRuntime(keys) {
	const CG = require('../bin-cep/js/codegen.js');
	const h = CG.helpers();
	let m;
	const lit = /'((?:[^'\\\n]|\\.)*)'/g;
	while ((m = lit.exec(h))) {
		const v = m[1];
		if (PT.test(v) && /\s/.test(v) && !/^ADBE |^Pseudo/.test(v)) add(keys, v, 'auxiliares do script');
	}
	const com = /\/\/ (.+)$/gm;
	while ((m = com.exec(h))) add(keys, m[1], 'auxiliares do script (comentário)');
}

function fromHost(keys) {
	const src = read('bin-cep/jsx/host.jsx');
	calls(src, 'bin_f').forEach((a) => literals(a[0] || '').forEach((v) => add(keys, v, 'host.jsx')));
	let m;
	const err = /error: '((?:[^'\\]|\\.)*)'/g;
	while ((m = err.exec(src))) add(keys, m[1], 'host.jsx');
	const warn = /warnings\.push\('((?:[^'\\]|\\.)*)'\)/g;
	while ((m = warn.exec(src))) add(keys, m[1], 'host.jsx');
}

// mensagens montadas no cep.js (o painel as traduz pelo modelo)
const CEP = ['erro no ExtendScript: {0}', 'resposta inválida do After Effects: {0}', 'After Effects não encontrado (painel fora do CEP).', 'sem acesso ao sistema de arquivos.'];

function fromInstaller(keys) {
	const f = path.join(ROOT, 'INSTALAR O BIN.jsx');
	if (!fs.existsSync(f)) return;
	const src = fs.readFileSync(f, 'utf8');
	calls(src, 'L').forEach((a) => literals(a[0] || '').forEach((v) => add(keys, v, 'instalador')));
}

function add(keys, v, where) {
	if (!v || !/[a-zà-ú]/i.test(v)) return;
	(keys[v] = keys[v] || []).indexOf(where) < 0 && keys[v].push(where);
}

function collect() {
	const keys = {};
	['bin-cep/js/app.js', 'bin-cep/js/codegen.js', 'bin-cep/js/ui.js'].forEach((f) => fromJS(f, keys));
	fromTables(keys);
	fromHTML(keys);
	fromRuntime(keys);
	fromHost(keys);
	CEP.forEach((k) => add(keys, k, 'cep.js'));
	fromInstaller(keys);
	return keys;
}

module.exports = { collect };
if (require.main === module) {
	const keys = collect();
	Object.keys(keys).forEach((k) => console.log(JSON.stringify(k) + '\t' + keys[k].join(', ')));
	console.error(Object.keys(keys).length + ' textos');
}
