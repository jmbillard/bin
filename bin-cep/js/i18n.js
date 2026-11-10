/*
 * BIN - traduções
 * Os textos ficam em i18n/textos.csv: uma linha por texto, uma coluna por idioma (pt, en, es…).
 * A coluna "pt" é a chave: o código continua escrito em português e chama BIN.t('texto').
 * Partes variáveis usam {0}, {1}…: BIN.t('comp “{0}” capturada', nome).
 * Para um idioma novo, basta acrescentar uma coluna no CSV (e o código dele em LANGS).
 */
(function (global) {
	'use strict';

	var BIN = global.BIN = global.BIN || {};
	var I = BIN.i18n = { LANGS: ['pt', 'en', 'es'], NAMES: { pt: 'português', en: 'English', es: 'español' }, lang: 'pt', table: {}, templates: [] };

	// ------------------------------------------------------------ CSV --------
	// RFC 4180: aspas para campos com vírgula, aspas ou quebra de linha; "\n" escrito vira quebra de linha
	I.parse = function (text) {
		var rows = [], row = [], f = '', q = false, i, c;
		text = String(text || '').replace(/^﻿/, '');
		for (i = 0; i < text.length; i++) {
			c = text.charAt(i);
			if (q) {
				if (c === '"') { if (text.charAt(i + 1) === '"') { f += '"'; i++; } else q = false; }
				else f += c;
			} else if (c === '"') q = true;
			else if (c === ',') { row.push(f); f = ''; }
			else if (c === '\n' || c === '\r') {
				if (c === '\r' && text.charAt(i + 1) === '\n') i++;
				row.push(f); f = '';
				if (row.length > 1 || row[0] !== '') rows.push(row);
				row = [];
			} else f += c;
		}
		if (f !== '' || row.length) { row.push(f); rows.push(row); }
		return rows;
	};

	function unescape(s) { return String(s).replace(/\\n/g, '\n'); }
	function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

	I.load = function (csv) {
		var rows = I.parse(csv);
		if (!rows.length) return 0;
		var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
		var pt = head.indexOf('pt');
		I.table = {};
		I.templates = [];
		rows.slice(1).forEach(function (r) {
			var key = unescape(r[pt] || '');
			if (!key) return;
			var entry = {};
			head.forEach(function (h, k) { if (r[k]) entry[h] = unescape(r[k]); });
			I.table[key] = entry;
			if (/\{\d\}/.test(key)) {
				// "não foi possível ler “{0}”: {1}" também reconhece a mensagem já montada (vinda do host)
				var order = [], src = '^' + reEscape(key).replace(/\\\{(\d)\\\}/g, function (all, n) { order.push(+n); return '([\\s\\S]*?)'; }) + '$';
				I.templates.push({ key: key, re: new RegExp(src), order: order });
			}
		});
		I.templates.sort(function (a, b) { return b.key.length - a.key.length; });
		return rows.length - 1;
	};

	// ------------------------------------------------------------ uso --------
	function fill(s, args) {
		return s.replace(/\{(\d)\}/g, function (all, n) { return args[n] !== undefined ? String(args[n]) : all; });
	}

	// texto em português → idioma atual (com {0}, {1}… preenchidos)
	I.t = function (pt) {
		var args = Array.prototype.slice.call(arguments, 1);
		var e = I.table[pt];
		var out = e && I.lang !== 'pt' && e[I.lang] ? e[I.lang] : pt;
		return fill(out, args);
	};

	// mensagem já montada em português (ex.: vinda do After Effects): acha o modelo e traduz as partes
	I.tr = function (msg) {
		msg = String(msg);
		if (I.lang === 'pt') return msg;
		if (I.table[msg]) return I.t(msg);
		for (var i = 0; i < I.templates.length; i++) {
			var m = I.templates[i].re.exec(msg);
			if (m) {
				var args = [];
				I.templates[i].order.forEach(function (n, k) { args[n] = I.tr(m[k + 1]); });
				return I.t.apply(null, [I.templates[i].key].concat(args));
			}
		}
		return msg;
	};

	// idioma do After Effects (app.isoLanguage: pt_BR, en_US, es_ES…) → um dos idiomas do BIN
	I.pick = function (iso) {
		var l = String(iso || '').slice(0, 2).toLowerCase();
		return I.LANGS.indexOf(l) >= 0 ? l : 'en';
	};

	// ------------------------------------------------------------ HTML -------
	// traduz textos e atributos do HTML; guarda o original para trocar de idioma de novo.
	// title e data-tip são o mesmo texto (os tooltips do BIN passam o title para data-tip no hover)
	function attrKey(el, a) {
		var k = a === 'title' || a === 'data-tip' ? 'i18nTip' : a === 'placeholder' ? 'i18nPlaceholder' : 'i18nAria';
		return k;
	}
	I.dom = function (root) {
		root = root || global.document.body;
		var walker = global.document.createTreeWalker(root, 4 /* SHOW_TEXT */, null, false), n;
		while ((n = walker.nextNode())) {
			if (n.parentNode && /^(SCRIPT|STYLE|PRE|TEXTAREA)$/.test(n.parentNode.nodeName)) continue;
			if (n.__pt === undefined) {
				var raw = n.nodeValue, key = raw.trim();
				if (!key || !I.table[key]) continue;
				n.__pt = raw;
			}
			var k2 = n.__pt.trim();
			n.nodeValue = n.__pt.replace(k2, I.t(k2));
		}
		Array.prototype.forEach.call(root.querySelectorAll('[title],[data-tip],[placeholder],[aria-label]'), function (el) {
			['title', 'data-tip', 'placeholder', 'aria-label'].forEach(function (a) {
				if (!el.hasAttribute(a)) return;
				var k = attrKey(el, a);
				if (el.dataset[k] === undefined) {
					if (!I.table[el.getAttribute(a)]) return;
					el.dataset[k] = el.getAttribute(a);
				}
				el.setAttribute(a, I.t(el.dataset[k]));
			});
		});
		global.document.documentElement.lang = { pt: 'pt-BR', en: 'en', es: 'es' }[I.lang] || I.lang;
	};

	I.set = function (lang) {
		I.lang = I.LANGS.indexOf(lang) >= 0 ? lang : 'pt';
		return I.lang;
	};

	// carrega o CSV da pasta da extensão (CEP), do mock (testes) ou por HTTP
	I.init = function () {
		var csv = null;
		try {
			var dir = BIN.extPath && BIN.extPath();
			if (dir && typeof global.require === 'function') csv = global.require('fs').readFileSync(dir + '/i18n/textos.csv', 'utf8');
		} catch (e) { csv = null; }
		if (!csv && global.BIN_MOCK && global.BIN_MOCK.i18n) csv = global.BIN_MOCK.i18n;
		if (!csv) {
			try {
				var x = new global.XMLHttpRequest();
				x.open('GET', 'i18n/textos.csv', false);
				x.send(null);
				if (x.status === 200 || (x.status === 0 && x.responseText)) csv = x.responseText;
			} catch (e2) { csv = null; }
		}
		return csv ? I.load(csv) : 0;
	};

	BIN.t = I.t;
	BIN.tr = I.tr;
	if (typeof module !== 'undefined' && module.exports && !global.document) module.exports = I;
})(typeof window !== 'undefined' ? window : this);
