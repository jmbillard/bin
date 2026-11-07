/*
 * BIN - painel
 *
 * fluxo: capturar (host.jsx) → escolher o que entra (aba propriedades) →
 * gerar o script (codegen.js, aba código) → recriar / copiar / exportar.
 */
(function (global) {
	'use strict';

	var BIN = global.BIN;
	var UI = BIN.ui;
	var CG = BIN.codegen;
	var $ = function (id) { return document.getElementById(id); };
	var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
	var esc = UI.esc;

	var HELP_URL = 'https://github.com/jmbillard/bin#readme';

	// ------------------------------------------------------ preferências ----
	var DEFAULTS = { theme: 'auto', target: 'active', wrap: true, parent: true, comments: true, keys: true, expr: true, codeWrap: false };
	var S = (function () {
		var s = {};
		try { s = JSON.parse(localStorage.getItem('bin.settings') || '{}') || {}; } catch (e) { s = {}; }
		Object.keys(DEFAULTS).forEach(function (k) { if (!(k in s)) s[k] = DEFAULTS[k]; });
		return s;
	})();
	function saveSettings() { try { localStorage.setItem('bin.settings', JSON.stringify(S)); } catch (e) { } }

	var state = {
		cap: null,       // captura preparada
		ex: {},          // ids excluídos
		open: {},        // grupos abertos / fechados (id → bool)
		nodes: {},       // id → { id, parent, kids[], node, kind }
		tab: 'props',
		code: '',
		helpersOpen: false,
		tools: { expr: '', bin: '', binName: 'arquivos_bin.jsxinc' }
	};
	BIN.state = state;

	// --------------------------------------------------------- textos ------
	var TYPE_LABEL = { shape: 'SHAPE', text: 'TEXT', solid: 'SOLID', adjustment: 'ADJ', null: 'NULL', camera: 'CAM', light: 'LUZ', precomp: 'COMP', footage: 'MÍDIA' };
	var TYPE_NAME = { shape: 'shape layer', text: 'texto', solid: 'solid', adjustment: 'adjustment layer', null: 'null', camera: 'câmera', light: 'luz', precomp: 'precomp', footage: 'footage' };
	var GROUP_TITLE = {
		'ADBE Transform Group': ['transform', 'move'],
		'ADBE Root Vectors Group': ['contents', 'shape'],
		'ADBE Effect Parade': ['effects', 'fx'],
		'ADBE Mask Parade': ['masks', 'mask'],
		'ADBE Text Properties': ['texto', 'text'],
		'ADBE Camera Options Group': ['câmera', 'camera'],
		'ADBE Light Options Group': ['luz', 'light'],
		'ADBE Material Options Group': ['material', 'cube'],
		'ADBE Audio Group': ['áudio', 'audio'],
		'ADBE Time Remapping': ['time remap', 'clock'],
		'ADBE Extrsn Options Group': ['geometria', 'cube'],
		'ADBE Plane Options Group': ['geometria', 'cube']
	};
	var ATTR_LABEL = {
		name: 'nome', label: 'rótulo', comment: 'comentário', enabled: 'visível', shy: 'shy', locked: 'travada', startTime: 'início',
		stretch: 'stretch', inPoint: 'entrada', outPoint: 'saída', threeDLayer: '3D', threeDPerChar: '3D por caractere', motionBlur: 'motion blur',
		adjustmentLayer: 'adjustment', guideLayer: 'guia', collapseTransformation: 'collapse', effectsActive: 'efeitos ativos',
		preserveTransparency: 'preservar transparência', timeRemapEnabled: 'time remap', audioEnabled: 'áudio', blendingMode: 'blend mode',
		quality: 'qualidade', samplingQuality: 'amostragem', frameBlendingType: 'frame blending', autoOrient: 'auto-orient'
	};
	var LABEL_COLORS = ['#777', '#b53838', '#e4d84c', '#a9cbc7', '#e5bcc9', '#a9a9ca', '#e7c19e', '#b3c7b3', '#677de0', '#4aa44c', '#8e2c9a', '#e8920d', '#7f452a', '#f46dd6', '#3da2a5', '#a89677', '#1e401e'];

	function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

	function fmtNum(n, d) {
		if (typeof n !== 'number') return String(n);
		var r = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
		return String(r === 0 ? 0 : r).replace('.', ',');
	}

	function fmtTime(t) {
		var fps = state.cap ? state.cap.comp.frameRate : 30;
		var s = Math.floor(t + 1e-6), f = Math.round((t - s) * fps);
		if (f >= Math.round(fps)) { s++; f = 0; }
		var m = Math.floor(s / 60);
		s = s % 60;
		return m + ':' + (s < 10 ? '0' : '') + s + (f ? ':' + (f < 10 ? '0' : '') + f : '');
	}

	function hex(c) {
		return '#' + c.slice(0, 3).map(function (x) {
			var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
			return h.length < 2 ? '0' + h : h;
		}).join('').toUpperCase();
	}

	function isColor(v, mn) {
		return Array.isArray(v) && (v.length === 4 || v.length === 3) && /colou?r/i.test(mn || '') && v.every(function (x) { return typeof x === 'number' && x >= -0.01 && x <= 1.01; });
	}

	// prévia do valor em uma linha
	function preview(v, mn) {
		if (v === undefined) return '';
		if (v === null) return '—';
		if (typeof v === 'boolean') return v ? 'sim' : 'não';
		if (typeof v === 'number') return esc(fmtNum(v, 2));
		if (typeof v === 'string') return '<span class="vt">"' + esc(v) + '"</span>';
		if (isColor(v, mn)) return '<span class="sw-c" style="background:' + hex(v) + '"></span>' + hex(v);
		if (Array.isArray(v)) return '<span class="vt">' + esc(v.map(function (x) { return typeof x === 'number' ? fmtNum(x, 1) : '…'; }).join('; ')) + '</span>';
		if (v.e) return esc(v.e.split('.')[1].toLowerCase().replace(/_/g, ' '));
		if (v.shape) return 'path · ' + v.shape.v.length + ' pts';
		if (v.doc) return '<span class="vt">"' + esc(v.doc.text.replace(/\r/g, ' ⏎ ')) + '"</span>';
		return '{…}';
	}

	// ------------------------------------------------------ tema ------------
	var THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
	var THEME_LABEL = { auto: 'tema automático\nsegue o After Effects', light: 'tema claro', dark: 'tema escuro' };

	function hostTheme() {
		var skin = BIN.hostSkin();
		var c = skin && skin.panelBackgroundColor && skin.panelBackgroundColor.color;
		if (c) return (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue) / 255 > 0.5 ? 'light' : 'dark';
		return global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}

	function applyTheme(animate) {
		var mode = S.theme === 'auto' ? hostTheme() : S.theme;
		var root = document.documentElement;
		if (animate && !UI.reduced()) {
			root.classList.add('theme-anim');
			clearTimeout(applyTheme.t);
			applyTheme.t = setTimeout(function () { root.classList.remove('theme-anim'); }, 550);
		}
		root.dataset.theme = mode;
		$('themeBtn').dataset.mode = S.theme;
		UI.setTip($('themeBtn'), THEME_LABEL[S.theme] + '\nclique para trocar');
	}

	// ------------------------------------------------------ abas ------------
	var TABS = ['props', 'code', 'tools'];

	function placeTabInk() {
		var b = document.querySelector('.tab.active');
		var ink = document.querySelector('.tab-ink');
		if (!b || !ink) return;
		ink.style.width = b.offsetWidth + 'px';
		ink.style.transform = 'translateX(' + b.offsetLeft + 'px)';
	}

	function showTab(name) {
		var from = TABS.indexOf(state.tab), to = TABS.indexOf(name);
		state.tab = name;
		each(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('active', t.dataset.tab === name); });
		each(document.querySelectorAll('.panel'), function (p) {
			var i = TABS.indexOf(p.id.replace('tab-', ''));
			p.style.setProperty('--from', (i < to ? -16 : 16) + 'px');
			p.classList.toggle('active', p.id === 'tab-' + name);
		});
		if (from !== to && name === 'code') renderCode();
		placeTabInk();
	}

	// --------------------------------------------------- modelo / ids ------
	function indexNodes() {
		var nodes = state.nodes = {};
		function reg(id, parent, kind, node) {
			nodes[id] = { id: id, parent: parent, kids: [], kind: kind, node: node };
			if (parent) nodes[parent].kids.push(id);
		}
		state.cap.layers.forEach(function (L) {
			reg(L.id, null, 'layer', L);
			reg(L.attrsId, L.id, 'attrs', L);
			CG.attrList(L).forEach(function (a) { reg(L.attrsId + '/' + a.key, L.attrsId, 'attr', a); });
			if (L.parent) reg(L.attrsId + '/parent', L.attrsId, 'attr', { key: 'parent', v: L.parent.name });
			if (L.matte && L.matte.name) reg(L.attrsId + '/matte', L.attrsId, 'attr', { key: 'matte', v: L.matte.name, type: L.matte.type });
			(function walk(list, pid) {
				list.forEach(function (n) {
					reg(n.id, pid, n.k === 'g' ? 'group' : 'prop', n);
					if (n.kids) walk(n.kids, n.id);
				});
			})(L.groups, L.id);
			if (L.markers.length) {
				reg(L.markersId, L.id, 'markers', L);
				L.markers.forEach(function (m, i) { reg(L.markersId + '/' + i, L.markersId, 'marker', m); });
			}
		});
	}

	function excluded(id) {
		for (var n = state.nodes[id]; n; n = state.nodes[n.parent]) if (state.ex[n.id]) return true;
		return false;
	}

	function anyExcludedBelow(id) {
		var n = state.nodes[id];
		return n.kids.some(function (k) { return state.ex[k] || anyExcludedBelow(k); });
	}

	function clearBelow(id) {
		state.nodes[id].kids.forEach(function (k) { delete state.ex[k]; clearBelow(k); });
	}

	function setIncluded(id, on) {
		if (!on) { state.ex[id] = true; return; }
		// liga o caminho até a raiz: irmãos que estavam desligados pelo ancestral continuam desligados
		var path = [];
		for (var n = state.nodes[id]; n; n = state.nodes[n.parent]) path.unshift(n.id);
		path.forEach(function (pid, i) {
			if (state.ex[pid] && i < path.length - 1) {
				delete state.ex[pid];
				state.nodes[pid].kids.forEach(function (k) { if (k !== path[i + 1]) state.ex[k] = true; });
			}
		});
		delete state.ex[id];
		clearBelow(id);
	}

	function opts() {
		return { target: S.target, wrap: S.wrap, parent: S.parent, comments: S.comments, keys: S.keys, expr: S.expr, excluded: state.ex };
	}

	// ---------------------------------------------------- captura ----------
	function capture(quiet) {
		$('logo').classList.remove('spin'); void $('logo').offsetWidth; $('logo').classList.add('spin');
		return BIN.callHostJSON('bin_capture').then(function (cap) {
			state.cap = CG.prepare(cap);
			state.ex = {};
			state.open = {};
			indexNodes();
			document.body.classList.remove('is-empty');
			$('empty').classList.add('hidden');
			$('propsView').classList.remove('hidden');
			$('runBtn').disabled = false;
			resetRun();
			render();
			if (!quiet) UI.toast(plural(cap.layers.length, 'layer capturada', 'layers capturadas') + ' de “' + esc(cap.comp.name) + '”.', 'ok', { life: 1800 });
		}).catch(function (e) {
			if (!quiet) UI.toast(esc(e.message), 'error');
		});
	}

	// ------------------------------------------------------ render ---------
	function render() {
		renderChip();
		renderTree();
		renderSummary();
		if (state.tab === 'code') renderCode();
	}

	function renderChip() {
		var cap = state.cap, n = cap.layers.length, L = cap.layers[0];
		var t = $('chipType');
		var st = CG.stats(cap, { excluded: {} });
		if (n === 1) {
			t.textContent = TYPE_LABEL[L.type] || 'LAYER';
			t.className = 'ltype t-' + L.type;
			$('chipName').textContent = L.name;
		} else {
			t.textContent = n + ' LAYERS';
			t.className = 'ltype t-multi';
			$('chipName').textContent = cap.layers.map(function (l) { return l.name; }).join(', ');
		}
		var meta = [cap.comp.name, plural(st.props, 'prop', 'props')];
		if (st.keys) meta.push(plural(st.keys, 'key', 'keys'));
		if (st.expr) meta.push(st.expr + ' expr');
		$('chipMeta').textContent = meta.join(' · ');
	}

	function counts(id) {
		var c = { props: 0, keys: 0, expr: 0 };
		(function walk(i) {
			var n = state.nodes[i];
			if (n.kind === 'prop') {
				c.props++;
				if (n.node.keys) c.keys += n.node.keys.length;
				if (n.node.x) c.expr++;
			} else if (n.kind === 'attr' || n.kind === 'marker') c.props++;
			n.kids.forEach(walk);
		})(id);
		return c;
	}

	function cntHTML(c, total) {
		var h = '';
		if (c.keys) h += '<i title="keyframes"><span class="dot k"></span>' + c.keys + '</i>';
		if (c.expr) h += '<i title="expressões"><span class="dot e"></span>' + c.expr + '</i>';
		if (total !== undefined) h += '<i>' + total + '</i>';
		return h;
	}

	function cbHTML(id) {
		var on = !excluded(id);
		var mixed = on && anyExcludedBelow(id);
		return '<input type="checkbox" class="cb' + (mixed ? ' mixed' : '') + '" data-id="' + id + '"' + (on && !mixed ? ' checked' : '') + '>';
	}

	function isOpen(id, def) { return id in state.open ? state.open[id] : def; }

	function matches(n, q) {
		if (!q) return true;
		var name = n.kind === 'attr' ? (ATTR_LABEL[n.node.key] || n.node.key) : n.kind === 'marker' ? n.node.comment : (n.node && n.node.name) || '';
		return String(name).toLowerCase().indexOf(q) >= 0;
	}

	function visible(id, q) {
		if (!q) return true;
		var n = state.nodes[id];
		return matches(n, q) || n.kids.some(function (k) { return visible(k, q); });
	}

	function keysHTML(keys) {
		var max = 6, h = '<span class="kd' + (S.keys ? '' : ' dis') + '">';
		for (var i = 0; i < Math.min(max, keys.length); i++) h += '<i></i>';
		if (keys.length > max) h += '<em>+' + (keys.length - max) + '</em>';
		return h + '</span>';
	}

	function rowHTML(id, depth, q) {
		var n = state.nodes[id];
		if (!visible(id, q)) return '';
		var off = excluded(id) ? ' off' : '';
		var hit = q && matches(n, q) ? ' match' : '';
		var d = ' style="--d:' + depth + '"';

		if (n.kind === 'group') {
			var open = q ? true : isOpen(id, true);
			var c = counts(id);
			var g = n.node;
			var sub = g.off ? '<small>desligado</small>' : '';
			return '<div class="grp' + (open ? '' : ' closed') + '"><div class="row group' + off + hit + '" data-toggle="' + id + '"' + d + '>' + cbHTML(id) +
				'<span class="tw">' + UI.icon('chevron', 'chev') + '</span><span class="n">' + esc(g.name) + sub + '</span><span class="cnt">' + cntHTML(c) + '</span></div>' +
				'<div class="grp-kids">' + n.kids.map(function (k) { return rowHTML(k, depth + 1, q); }).join('') + '</div></div>';
		}

		var name, val = '', title = '';
		if (n.kind === 'prop') {
			var p = n.node;
			name = esc(p.name);
			if (p.sep) val = 'dimensões separadas';
			else if (p.keys) val = keysHTML(p.keys) + '<span class="vt">' + preview(p.keys[0].v, p.mn) + '</span>';
			else val = preview(p.v, p.mn);
			if (p.x) val = '<span class="xf' + (S.expr ? '' : ' dis') + '" title="expressão' + (p.xoff ? ' (desligada)' : '') + '\n' + esc(p.x.split(/\r|\n/)[0].slice(0, 80)) + '">ƒ</span>' + val;
			if (p.add && p.v === undefined && !p.keys) val = '<span class="faint">adicionada</span>';
			title = p.mn;
		} else if (n.kind === 'attr') {
			var a = n.node;
			name = ATTR_LABEL[a.key] || (a.key === 'parent' ? 'parent' : a.key === 'matte' ? 'track matte' : a.key);
			if (a.key === 'label') val = '<span class="sw-c" style="background:' + (LABEL_COLORS[a.v] || '#777') + '"></span>' + a.v;
			else if (a.key === 'inPoint' || a.key === 'outPoint' || a.key === 'startTime') val = fmtTime(a.v);
			else if (a.key === 'parent') val = '<span class="vt">→ ' + esc(a.v) + '</span>';
			else if (a.key === 'matte') val = '<span class="vt">' + preview(a.type) + ' · ' + esc(a.v) + '</span>';
			else val = preview(a.v);
		} else if (n.kind === 'marker') {
			var m = n.node;
			name = fmtTime(m.t);
			val = '<span class="vt">' + (m.comment ? '"' + esc(m.comment) + '"' : '<span class="faint">sem comentário</span>') + '</span>';
		}
		return '<label class="row' + off + hit + '"' + d + (title ? ' title="' + esc(title) + '"' : '') + '>' + cbHTML(id) + '<span class="n">' + name + '</span><span class="v">' + val + '</span></label>';
	}

	function cardHTML(id, title, icon, defOpen, q) {
		if (!visible(id, q)) return '';
		var n = state.nodes[id];
		var open = q ? true : isOpen(id, defOpen);
		var c = counts(id);
		var kids = n.kind === 'prop' ? rowHTML(id, 0, q) : n.kids.map(function (k) { return rowHTML(k, 0, q); }).join('');
		return '<div class="card' + (open ? '' : ' closed') + (excluded(id) ? ' off' : '') + '">' +
			'<div class="card-head" data-toggle="' + id + '">' + (n.kind === 'prop' ? '' : cbHTML(id)) + UI.icon(icon, 'g') + '<b>' + esc(title) + '</b>' +
			'<span class="cnt">' + cntHTML(c, c.props) + UI.icon('chevron', 'chev') + '</span></div>' +
			'<div class="rows">' + kids + '</div></div>';
	}

	function renderTree() {
		var cap = state.cap;
		var q = $('query').value.trim().toLowerCase();
		var multi = cap.layers.length > 1;
		var html = '';
		cap.layers.forEach(function (L) {
			if (multi) {
				html += '<label class="layer-head' + (excluded(L.id) ? ' off' : '') + '">' + cbHTML(L.id) +
					'<span class="ltype t-' + L.type + '">' + (TYPE_LABEL[L.type] || '') + '</span><span class="lname">' + esc(L.name) + '</span>' +
					'<span class="faint">#' + L.index + '</span></label>';
			}
			html += cardHTML(L.attrsId, 'layer · ' + (TYPE_NAME[L.type] || L.type), 'attrs', !multi, q);
			L.groups.forEach(function (g, i) {
				var t = GROUP_TITLE[g.mn] || [g.name.toLowerCase(), 'layers'];
				var def = !multi && (g.mn === 'ADBE Transform Group' || g.mn === 'ADBE Root Vectors Group' || g.mn === 'ADBE Text Properties' || i === 0);
				html += cardHTML(g.id, t[0], t[1], def, q);
			});
			if (L.markers.length) html += cardHTML(L.markersId, 'markers', 'marker', false, q);
		});
		if (!html) html = '<div class="empty" style="padding:24px"><small>nada encontrado para “' + esc(q) + '”</small></div>';
		$('tree').innerHTML = html;
	}

	function renderSummary() {
		var cap = state.cap;
		var st = CG.stats(cap, opts());
		var layers = cap.layers.filter(function (L) { return !state.ex[L.id]; }).length;
		var code = CG.generate(cap, opts());
		state.code = code;
		var lines = code.split('\n').length;

		var badge = $('propBadge');
		var prev = badge.textContent;
		badge.textContent = st.props;
		badge.classList.remove('hidden');
		if (prev && prev !== String(st.props)) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }

		var parts = ['<b>' + layers + '</b> ' + (layers === 1 ? 'layer' : 'layers'), plural(lines, 'linha', 'linhas')];
		if (st.keys && S.keys) parts.push(plural(st.keys, 'key', 'keys'));
		$('sumText').innerHTML = UI.icon('layers') + parts.join('<span class="sep">·</span>');

		// avisos
		var warns = [];
		cap.layers.forEach(function (L) {
			if (state.ex[L.id]) return;
			L.warnings.forEach(function (w) { warns.push(w); });
			(function walk(list) {
				list.forEach(function (n) {
					if (n.fx && !/^(ADBE |CC |APC |CS |VISINF |ISL |PEDG |SYNTHAP |BE |CINEMA 4D|Mettle)/.test(n.mn)) warns.push('“' + n.name + '” (' + n.mn + ') pode ser um plug-in de terceiro: só funciona onde estiver instalado.');
					if (n.kids) walk(n.kids);
				});
			})(L.groups);
			if (L.type === 'text') {
				var tp = L.groups.filter(function (g) { return g.mn === 'ADBE Text Properties'; })[0];
				var td = tp && tp.kids.filter(function (k) { return k.mn === 'ADBE Text Document'; })[0];
				var doc = td && (td.v || (td.keys && td.keys[0].v));
				if (doc && doc.doc && doc.doc.font) warns.push('“' + L.name + '” usa a fonte ' + doc.doc.font + ': ela precisa estar instalada onde o script rodar.');
			}
		});
		state.warnings = warns;
		var pill = $('warnPill');
		pill.classList.toggle('hidden', !warns.length);
		pill.querySelector('span').textContent = plural(warns.length, 'aviso', 'avisos');
		UI.setTip(pill, plural(warns.length, 'aviso', 'avisos') + '\nclique para ver');

		var n = layers;
		$('runTxt').textContent = n > 1 ? 'recriar ' + n + ' layers' : 'recriar layer';
		$('runBtn').disabled = !n;
		$('fnHint').textContent = S.wrap ? 'criar_' + CG.snake((cap.layers.filter(function (L) { return !state.ex[L.id]; })[0] || cap.layers[0]).name) + '(comp)' : 'código corrido, sem funções';
	}

	// ------------------------------------------------------- código --------
	var TOKEN = /(\/\/.*$)|('(?:[^'\\]|\\.)*')|(\b(?:var|function|return|if|else|try|catch|for|new|true|false|null|in)\b)|(\bbin\.\w+|\b(?:app|comp)\b)|(-?\b\d+(?:\.\d+)?\b)/g;

	function highlight(line) {
		var out = '', last = 0, m;
		TOKEN.lastIndex = 0;
		while ((m = TOKEN.exec(line))) {
			out += esc(line.slice(last, m.index));
			var cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'f' : 'n';
			out += '<span class="tk-' + cls + '">' + esc(m[0]) + '</span>';
			last = TOKEN.lastIndex;
		}
		return out + esc(line.slice(last));
	}

	function renderCode() {
		if (!state.cap) {
			$('codeView').innerHTML = '<span class="l"><span class="tk-c">// capture uma layer na aba propriedades</span></span>';
			$('lineCount').textContent = '';
			$('fileName').textContent = '';
			return;
		}
		var code = state.code || CG.generate(state.cap, opts());
		var lines = code.split('\n');
		var start = -1, end = -1;
		lines.forEach(function (l, i) {
			if (start < 0 && /\/\/ ---- funções auxiliares do BIN/.test(l)) start = i;
			if (start >= 0 && end < 0 && i > start && /^\t\};$/.test(l)) end = i;
		});
		var html = '';
		for (var i = 0; i < lines.length; i++) {
			if (i === start && !state.helpersOpen && end > start) {
				html += '<span class="fold" id="foldHelpers" title="mostrar as funções auxiliares">funções auxiliares do BIN · ' + (end - start + 1) + ' linhas</span>';
				i = end;
				continue;
			}
			html += '<span class="l">' + (highlight(lines[i]) || ' ') + '</span>';
		}
		$('codeView').innerHTML = html;
		$('codeBox').classList.toggle('wrap', S.codeWrap);
		$('lineCount').textContent = plural(lines.length, 'linha', 'linhas');
		$('fileName').textContent = fileName();
		var fold = $('foldHelpers');
		if (fold) fold.onclick = function () { state.helpersOpen = true; renderCode(); };
	}

	function fileName() {
		var L = state.cap.layers.filter(function (l) { return !state.ex[l.id]; });
		return 'criar_' + CG.snake(L.length === 1 ? L[0].name : state.cap.comp.name) + '.jsx';
	}

	function changed() {
		resetRun();
		renderTree();
		renderSummary();
		if (state.tab === 'code') renderCode();
	}

	// --------------------------------------------------------- salvar ------
	function saveText(text, name) {
		return BIN.dialog.saveFile('exportar…', name).then(function (p) {
			if (p) {
				if (!BIN.fs.writeText(p, text)) throw new Error('não foi possível gravar o arquivo.');
				return p;
			}
			if (!BIN.isCEP || (global.cep && global.cep.fs && global.cep.fs.showSaveDialogEx)) return null;
			// sem diálogo do CEP: o After Effects salva
			return BIN.callHostJSON('bin_saveText', [text, name]).then(function (r) { return r.path || null; });
		}).then(function (p) {
			if (p) UI.toast('salvo em <b>' + esc(BIN.fs.basename(p)) + '</b>.', 'ok');
			return p;
		}).catch(function (e) { UI.toast(esc(e.message), 'error'); });
	}

	function copyText(text, what) {
		BIN.copy(text).then(function (ok) {
			UI.toast(ok ? what + ' copiado.' : 'não foi possível copiar: selecione o texto e use Ctrl/Cmd+C.', ok ? 'ok' : 'warn', { life: 1600 });
		});
	}

	// -------------------------------------------------------- recriar ------
	function resetRun() {
		var b = $('runBtn');
		b.classList.remove('done', 'working');
		b.querySelector('.ico').outerHTML = UI.icon('sparkle');
		clearTimeout(resetRun.t);
	}

	function run() {
		var b = $('runBtn');
		if (b.classList.contains('working')) return;
		if (b.classList.contains('done')) { resetRun(); return; }
		var code = CG.generate(state.cap, opts());
		UI.hideToast();
		b.classList.add('working');
		$('runTxt').textContent = 'recriando…';

		var p;
		var tmp = BIN.fs.tmpFile('bin_run.jsx');
		if (tmp && BIN.fs.writeText(tmp, code)) p = BIN.callHostJSON('bin_runFile', [tmp]);
		else p = BIN.callHostJSON('bin_run', [code]);

		p.then(function (r) {
			b.classList.remove('working');
			b.classList.add('done');
			b.querySelector('.ico').outerHTML = UI.icon('check');
			var names = r.layers || [];
			$('runTxt').textContent = names.length > 1 ? names.length + ' layers criadas' : 'layer criada';
			var msg = (names.length === 1 ? '<b>' + esc(names[0]) + '</b> criada' : '<b>' + names.length + '</b> layers criadas') + (r.comp ? ' em “' + esc(r.comp) + '”.' : '.');
			var errs = r.errors || [];
			if (errs.length) msg += ' ' + plural(errs.length, 'propriedade não pôde ser aplicada:', 'propriedades não puderam ser aplicadas:');
			UI.toast(msg, errs.length ? 'warn' : 'ok', {
				sticky: true,
				details: errs,
				actions: [
					{ label: 'desfazer', icon: 'undo', run: function () { BIN.callHostJSON('bin_undo').then(function () { UI.toast('desfeito.', 'info', { life: 1400 }); resetRun(); renderSummary(); }); } },
					{ label: 'exportar .jsx', icon: 'save', run: function () { saveText(code, fileName()); } }
				]
			});
			resetRun.t = setTimeout(function () { resetRun(); renderSummary(); }, 4000);
		}).catch(function (e) {
			resetRun();
			renderSummary();
			UI.toast(esc(e.message), 'error', { sticky: true });
		});
	}

	// ----------------------------------------------------- utilitários -----
	function showOut(which, code, info) {
		state.tools[which] = code;
		var box = $(which + 'Out');
		box.classList.remove('hidden');
		var pre = box.querySelector('pre');
		pre.textContent = code.length > 20000 ? code.slice(0, 20000) + '\n… (' + CG.size(code.length) + ' no total: use copiar ou exportar)' : code;
		$(which + 'Info').textContent = info;
	}

	function getExpressions() {
		BIN.callHostJSON('bin_expressions').then(function (r) {
			showOut('expr', CG.expressions(r.items), plural(r.items.length, 'expressão', 'expressões'));
		}).catch(function (e) { UI.toast(esc(e.message), 'error'); });
	}

	function convertFiles(list) {
		Promise.all(list.map(function (f) {
			if (f.bytes) return f;
			if (f.path) return { name: BIN.fs.basename(f.path), bytes: BIN.fs.readBinary(f.path) };
			return f.file.arrayBuffer().then(function (buf) { return { name: f.file.name, bytes: new Uint8Array(buf) }; });
		})).then(function (files) {
			if (!files.length) return;
			var total = files.reduce(function (s, f) { return s + f.bytes.length; }, 0);
			state.tools.binName = (files.length === 1 ? CG.snake(files[0].name.replace(/\.[^.]+$/, '')) : 'arquivos') + '_bin.jsxinc';
			showOut('bin', CG.binaryFiles(files), plural(files.length, 'arquivo', 'arquivos') + ' · ' + CG.size(total));
		}).catch(function (e) { UI.toast(esc(e.message), 'error'); });
	}

	// ----------------------------------------------------------- bind ------
	function bind() {
		$('logo').innerHTML = UI.logo;
		UI.hydrateIcons();
		UI.tooltips();

		applyTheme(false);
		$('themeBtn').onclick = function () {
			S.theme = THEME_NEXT[S.theme] || 'auto';
			saveSettings();
			applyTheme(true);
		};
		BIN.onHostThemeChange(function () { if (S.theme === 'auto') applyTheme(true); });
		$('helpBtn').onclick = function () { BIN.openURL(HELP_URL); };

		each(document.querySelectorAll('.tab'), function (t) { t.onclick = function () { showTab(t.dataset.tab); }; });
		global.addEventListener('resize', placeTabInk);
		setTimeout(placeTabInk, 0);

		$('chip').onclick = function () { capture(false); };
		$('captureBtn').onclick = function () { capture(false); };

		// árvore: abrir/fechar e caixas
		$('tree').addEventListener('click', function (e) {
			var cb = e.target.closest('.cb');
			if (cb) {
				e.stopPropagation();
				// caixa parcial (alguns filhos desligados): o clique liga tudo
				setIncluded(cb.dataset.id, cb.classList.contains('mixed') ? true : cb.checked);
				changed();
				return;
			}
			var t = e.target.closest('[data-toggle]');
			if (t) {
				var id = t.dataset.toggle;
				var el = t.parentNode;
				var open = el.classList.contains('closed');
				state.open[id] = open;
				el.classList.toggle('closed', !open);
			}
		});
		$('query').addEventListener('input', renderTree);
		$('expandAll').onclick = function () { Object.keys(state.nodes).forEach(function (id) { state.open[id] = true; }); renderTree(); };
		$('collapseAll').onclick = function () { Object.keys(state.nodes).forEach(function (id) { state.open[id] = false; }); renderTree(); };

		function toggleOpt(btn, key) {
			btn.classList.toggle('on', !!S[key]);
			btn.onclick = function () {
				S[key] = !S[key];
				saveSettings();
				btn.classList.toggle('on', S[key]);
				if (state.cap) changed();
			};
		}
		toggleOpt($('optKeys'), 'keys');
		toggleOpt($('optExpr'), 'expr');

		// código
		function sw(el, key) {
			el.checked = !!S[key];
			el.onchange = function () { S[key] = el.checked; saveSettings(); if (state.cap) changed(); };
		}
		sw($('optWrap'), 'wrap');
		sw($('optParent'), 'parent');
		sw($('optComments'), 'comments');
		var seg = $('targetSeg');
		function setTarget(v) { each(seg.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.value === v); }); }
		setTarget(S.target);
		seg.onclick = function (e) {
			var b = e.target.closest('button');
			if (!b) return;
			S.target = b.dataset.value; saveSettings(); setTarget(S.target);
			if (state.cap) changed();
		};
		$('wrapBtn').classList.toggle('on', S.codeWrap);
		$('wrapBtn').onclick = function () { S.codeWrap = !S.codeWrap; saveSettings(); $('wrapBtn').classList.toggle('on', S.codeWrap); $('codeBox').classList.toggle('wrap', S.codeWrap); };
		$('copyBtn').onclick = function () { if (state.cap) copyText(CG.generate(state.cap, opts()), 'código'); };
		$('exportBtn').onclick = function () { if (state.cap) saveText(CG.generate(state.cap, opts()), fileName()); };

		$('runBtn').onclick = run;
		$('warnPill').onclick = function () { UI.toast(plural(state.warnings.length, 'aviso', 'avisos') + ' sobre o script gerado:', 'warn', { sticky: true, details: state.warnings }); };

		// utilitários
		$('exprBtn').onclick = getExpressions;
		var drop = $('binDrop');
		drop.onclick = function () {
			BIN.dialog.openFiles('escolha os arquivos').then(function (paths) {
				convertFiles(paths.map(function (p) { return { path: p }; }));
			});
		};
		drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.onclick(); } };
		['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
		['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('over'); }); });
		drop.addEventListener('drop', function (e) {
			e.preventDefault();
			var files = Array.prototype.slice.call(e.dataTransfer.files || []);
			convertFiles(files.map(function (f) { return f.path && BIN.hasFS ? { path: f.path } : { file: f }; }));
		});
		// o painel inteiro não deve abrir o arquivo solto fora da área
		document.addEventListener('dragover', function (e) { e.preventDefault(); });
		document.addEventListener('drop', function (e) { e.preventDefault(); });

		each(document.querySelectorAll('[data-copy]'), function (b) {
			b.onclick = function () { copyText(state.tools[b.dataset.copy], b.dataset.copy === 'expr' ? 'expressão' : 'código'); };
		});
		each(document.querySelectorAll('[data-save]'), function (b) {
			b.onclick = function () { saveText(state.tools[b.dataset.save], b.dataset.save === 'expr' ? 'expressoes.jsxinc' : state.tools.binName); };
		});

		renderCode();
		capture(true);
	}

	BIN.app = { capture: capture, showTab: showTab, state: state };

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
	else bind();
})(window);
