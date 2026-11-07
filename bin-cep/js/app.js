/*
 * BIN - painel
 *
 * fluxo: capturar (host.jsx) → escolher o que entra (aba propriedades) →
 * gerar o script (codegen.js, aba código) → recriar / copiar / exportar.
 *
 * dois modos de captura:
 *   layers → as layers selecionadas na comp ativa;
 *   comp   → a comp ativa inteira, com as precomps usadas dentro dela.
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
	var DEFAULTS = { theme: 'auto', mode: 'layers', target: 'active', wrap: true, parent: true, comments: true, keys: true, expr: true, codeWrap: false };
	var S = (function () {
		var s = {};
		try { s = JSON.parse(localStorage.getItem('bin.settings') || '{}') || {}; } catch (e) { s = {}; }
		Object.keys(DEFAULTS).forEach(function (k) { if (!(k in s)) s[k] = DEFAULTS[k]; });
		return s;
	})();
	function saveSettings() { try { localStorage.setItem('bin.settings', JSON.stringify(S)); } catch (e) { } }

	var state = {
		m: null,          // modelo preparado (CG.prepare)
		ex: {},           // ids desligados
		open: {},         // grupos abertos / fechados (id → bool)
		nodes: {},        // id → { id, parent, kids[], kind, node }
		tab: 'props',
		code: '',
		warnings: [],
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
		quality: 'qualidade', samplingQuality: 'amostragem', frameBlendingType: 'frame blending', autoOrient: 'auto-orient',
		parent: 'parent', matte: 'track matte'
	};
	var COMP_LABEL = {
		size: 'tamanho', duration: 'duração', frameRate: 'frame rate',
		bgColor: 'cor de fundo', displayStartTime: 'início do timecode', workAreaStart: 'início da work area', workAreaDuration: 'duração da work area',
		motionBlur: 'motion blur', frameBlending: 'frame blending', hideShyLayers: 'esconder shy', draft3d: 'draft 3D', shutterAngle: 'shutter angle',
		shutterPhase: 'shutter phase', motionBlurSamplesPerFrame: 'amostras por quadro', motionBlurAdaptiveSampleLimit: 'limite adaptativo',
		preserveNestedFrameRate: 'preservar fps aninhado', preserveNestedResolution: 'preservar resolução aninhada', resolutionFactor: 'resolução',
		renderer: 'renderizador', comment: 'comentário', label: 'rótulo'
	};
	var TIME_KEYS = /^(inPoint|outPoint|startTime|displayStartTime|workAreaStart|workAreaDuration|duration)$/;
	var LABEL_COLORS = ['#777', '#b53838', '#e4d84c', '#a9cbc7', '#e5bcc9', '#a9a9ca', '#e7c19e', '#b3c7b3', '#677de0', '#4aa44c', '#8e2c9a', '#e8920d', '#7f452a', '#f46dd6', '#3da2a5', '#a89677', '#1e401e'];
	// efeitos nativos do After Effects (o resto pode ser plug-in de terceiro)
	var NATIVE_FX = /^(ADBE |CC |APC |CS |VISINF |ISL |PEDG |SYNTHAP |BE |CINEMA 4D|Mettle)/;

	function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

	function fmtNum(n, d) {
		if (typeof n !== 'number') return String(n);
		var p = Math.pow(10, d), r = Math.round(n * p) / p;
		return String(r === 0 ? 0 : r).replace('.', ',');
	}

	function fmtTime(t) {
		var fps = state.m ? state.m.rootComp.frameRate : 30;
		var neg = t < 0 ? '-' : '';
		t = Math.abs(t);
		var s = Math.floor(t + 1e-6), f = Math.round((t - s) * fps);
		if (f >= Math.round(fps)) { s++; f = 0; }
		var m = Math.floor(s / 60);
		s = s % 60;
		return neg + m + ':' + (s < 10 ? '0' : '') + s + (f ? ':' + (f < 10 ? '0' : '') + f : '');
	}

	function hex(c) {
		return '#' + c.slice(0, 3).map(function (x) {
			var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
			return h.length < 2 ? '0' + h : h;
		}).join('').toUpperCase();
	}

	function isColor(v, mn) {
		return Array.isArray(v) && (v.length === 4 || v.length === 3) && /colou?r/i.test(mn || '') &&
			v.every(function (x) { return typeof x === 'number' && x >= -0.01 && x <= 1.01; });
	}

	// prévia do valor em uma linha
	function preview(v, mn) {
		if (v === undefined) return '';
		if (v === null) return '—';
		if (typeof v === 'boolean') return v ? 'sim' : 'não';
		if (typeof v === 'number') return esc(TIME_KEYS.test(mn || '') ? fmtTime(v) : fmtNum(v, 2));
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

	// ------------------------------------------- árvore de ids / caixas ----
	function indexNodes() {
		var nodes = state.nodes = {};
		var m = state.m;
		function reg(id, parent, kind, node) {
			nodes[id] = { id: id, parent: parent, kids: [], kind: kind, node: node };
			if (parent) nodes[parent].kids.push(id);
		}
		m.comps.forEach(function (C) {
			var cp = null;
			if (m.mode === 'comp') {
				cp = C.key;
				reg(C.key, null, 'comp', C);
				reg(C.settingsId, C.key, 'settings', C);
				['size', 'duration', 'frameRate'].forEach(function (k) { reg(C.settingsId + '#' + k, C.settingsId, 'cinfo', { key: k, C: C }); });
				CG.compAttrList(C).forEach(function (a) { reg(C.settingsId + '/' + a.key, C.settingsId, 'csetting', a); });
				if (C.markers.length) {
					reg(C.markersId, C.key, 'markers', C);
					C.markers.forEach(function (mk, i) { reg(C.markersId + '/' + i, C.markersId, 'marker', mk); });
				}
			}
			C.layers.forEach(function (L) {
				reg(L.id, cp, 'layer', L);
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
					L.markers.forEach(function (mk, i) { reg(L.markersId + '/' + i, L.markersId, 'marker', mk); });
				}
			});
		});
	}

	function excluded(id) {
		for (var n = state.nodes[id]; n; n = state.nodes[n.parent]) if (state.ex[n.id]) return true;
		return false;
	}

	function anyExcludedBelow(id) {
		return state.nodes[id].kids.some(function (k) { return state.ex[k] || anyExcludedBelow(k); });
	}

	function clearBelow(id) {
		state.nodes[id].kids.forEach(function (k) { delete state.ex[k]; clearBelow(k); });
	}

	function setIncluded(id, on) {
		if (!on) { state.ex[id] = true; return; }
		// liga o caminho até a raiz: os irmãos que estavam desligados pelo ancestral continuam desligados
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
		var logo = $('logo');
		logo.classList.remove('spin'); void logo.offsetWidth; logo.classList.add('spin');
		var mode = S.mode;
		return BIN.callHostJSON(mode === 'comp' ? 'bin_captureComp' : 'bin_capture').then(function (raw) {
			state.m = CG.prepare(raw);
			state.ex = {};
			state.open = {};
			indexNodes();
			document.body.classList.remove('is-empty');
			$('empty').classList.add('hidden');
			$('propsView').classList.remove('hidden');
			resetRun();
			render();
			if (!quiet) {
				var m = state.m, msg;
				if (m.mode === 'comp') {
					var pre = m.comps.length - 1;
					msg = 'comp “' + esc(m.rootComp.name) + '” capturada' + (pre ? ' com ' + plural(pre, 'precomp', 'precomps') : '') + '.';
				} else msg = plural(m.rootComp.layers.length, 'layer capturada', 'layers capturadas') + ' de “' + esc(m.rootComp.name) + '”.';
				UI.toast(msg, 'ok', { life: 1800 });
			}
		}).catch(function (e) {
			if (!quiet) UI.toast(esc(e.message), 'error');
		});
	}

	function setMode(mode) {
		S.mode = mode;
		saveSettings();
		each($('modeSeg').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.value === mode); });
	}

	// ------------------------------------------------------ render ---------
	function render() {
		setMode(state.m.mode);
		renderChip();
		renderTree();
		renderSummary();
		if (state.tab === 'code') renderCode();
	}

	function renderChip() {
		var m = state.m, C = m.rootComp, t = $('chipType');
		var st = CG.stats(m, {});
		var meta;
		if (m.mode === 'comp') {
			t.textContent = 'COMP';
			t.className = 'ltype t-comp';
			$('chipName').textContent = C.name;
			meta = [plural(C.layers.length, 'layer', 'layers')];
			if (m.comps.length > 1) meta.push(plural(m.comps.length - 1, 'precomp', 'precomps'));
		} else if (C.layers.length === 1) {
			var L = C.layers[0];
			t.textContent = TYPE_LABEL[L.type] || 'LAYER';
			t.className = 'ltype t-' + L.type;
			$('chipName').textContent = L.name;
			meta = [C.name, plural(st.props, 'prop', 'props')];
		} else {
			t.textContent = C.layers.length + ' LAYERS';
			t.className = 'ltype t-multi';
			$('chipName').textContent = C.layers.map(function (l) { return l.name; }).join(', ');
			meta = [C.name, plural(st.props, 'prop', 'props')];
		}
		if (st.keys) meta.push(plural(st.keys, 'key', 'keys'));
		if (st.expr) meta.push(st.expr + ' expr');
		$('chipMeta').textContent = meta.join(' · ');
	}

	function counts(id) {
		var c = { props: 0, keys: 0, expr: 0, layers: 0 };
		(function walk(i) {
			var n = state.nodes[i];
			if (n.kind === 'prop') {
				c.props++;
				if (n.node.keys) c.keys += n.node.keys.length;
				if (n.node.x) c.expr++;
			} else if (n.kind === 'attr' || n.kind === 'marker' || n.kind === 'csetting' || n.kind === 'cinfo') c.props++;
			else if (n.kind === 'layer') c.layers++;
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

	function cbHTML(id, disabled) {
		var on = !excluded(id);
		var mixed = on && anyExcludedBelow(id);
		return '<input type="checkbox" class="cb' + (mixed ? ' mixed' : '') + '" data-id="' + id + '"' + (on && !mixed ? ' checked' : '') + (disabled ? ' disabled' : '') + '>';
	}

	function isOpen(id, def) { return id in state.open ? state.open[id] : def; }

	function label(n) {
		switch (n.kind) {
			case 'attr': return ATTR_LABEL[n.node.key] || n.node.key;
			case 'csetting':
			case 'cinfo': return COMP_LABEL[n.node.key] || n.node.key;
			case 'marker': return n.node.comment || '';
			default: return (n.node && n.node.name) || '';
		}
	}

	function matches(n, q) { return !q || String(label(n)).toLowerCase().indexOf(q) >= 0; }

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

	function rowValue(n) {
		var v = n.node;
		switch (n.kind) {
			case 'prop': {
				var val;
				if (v.sep) val = 'dimensões separadas';
				else if (v.keys) val = keysHTML(v.keys) + '<span class="vt">' + preview(v.keys[0].v, v.mn) + '</span>';
				else val = preview(v.v, v.mn);
				if (v.add && v.v === undefined && !v.keys) val = '<span class="faint">adicionada</span>';
				if (v.x) val = '<span class="xf' + (S.expr ? '' : ' dis') + '" title="expressão' + (v.xoff ? ' (desligada)' : '') + '\n' + esc(v.x.split(/\r|\n/)[0].slice(0, 80)) + '">ƒ</span>' + val;
				return val;
			}
			case 'attr':
				if (v.key === 'label') return '<span class="sw-c" style="background:' + (LABEL_COLORS[v.v] || '#777') + '"></span>' + v.v;
				if (v.key === 'parent') return '<span class="vt">→ ' + esc(v.v) + '</span>';
				if (v.key === 'matte') return '<span class="vt">' + preview(v.type) + ' · ' + esc(v.v) + '</span>';
				return preview(v.v, v.key);
			case 'csetting':
				if (v.key === 'label') return '<span class="sw-c" style="background:' + (LABEL_COLORS[v.v] || '#777') + '"></span>' + v.v;
				if (v.key === 'bgColor') return preview(v.v, 'color');
				return preview(v.v, v.key);
			case 'cinfo': {
				var C = v.C;
				if (v.key === 'size') return C.width + ' × ' + C.height + (C.pixelAspect !== 1 ? ' · ' + fmtNum(C.pixelAspect, 2) : '');
				if (v.key === 'duration') return fmtTime(C.duration);
				return fmtNum(C.frameRate, 3) + ' fps';
			}
			case 'marker':
				return '<span class="vt">' + (v.comment ? '"' + esc(v.comment) + '"' : '<span class="faint">sem comentário</span>') + '</span>';
		}
		return '';
	}

	function rowHTML(id, depth, q) {
		var n = state.nodes[id];
		if (!visible(id, q)) return '';
		var off = excluded(id) ? ' off' : '';
		var hit = q && matches(n, q) ? ' match' : '';
		var d = ' style="--d:' + depth + '"';

		if (n.kind === 'group') {
			var open = q ? true : isOpen(id, true);
			var g = n.node;
			return '<div class="grp' + (open ? '' : ' closed') + '"><div class="row group' + off + hit + '" data-toggle="' + id + '"' + d + '>' + cbHTML(id) +
				'<span class="tw">' + UI.icon('chevron', 'chev') + '</span><span class="n">' + esc(g.name) + (g.off ? '<small>desligado</small>' : '') + '</span><span class="cnt">' + cntHTML(counts(id)) + '</span></div>' +
				'<div class="grp-kids">' + n.kids.map(function (k) { return rowHTML(k, depth + 1, q); }).join('') + '</div></div>';
		}

		var name = n.kind === 'marker' ? fmtTime(n.node.t) : esc(label(n));
		var title = n.kind === 'prop' ? ' title="' + esc(n.node.mn) + '"' : '';
		var box = n.kind === 'cinfo' ? '<span class="cb-fix" title="sempre incluído"></span>' : cbHTML(id);
		return '<label class="row' + off + hit + '"' + d + title + '>' + box + '<span class="n">' + name + '</span><span class="v">' + rowValue(n) + '</span></label>';
	}

	function cardHTML(id, title, icon, defOpen, q) {
		if (!state.nodes[id] || !visible(id, q)) return '';
		var n = state.nodes[id];
		var open = q ? true : isOpen(id, defOpen);
		var c = counts(id);
		var kids = n.kind === 'prop' ? rowHTML(id, 0, q) : n.kids.map(function (k) { return rowHTML(k, 0, q); }).join('');
		return '<div class="card' + (open ? '' : ' closed') + (excluded(id) ? ' off' : '') + '">' +
			'<div class="card-head" data-toggle="' + id + '">' + (n.kind === 'prop' ? '' : cbHTML(id)) + UI.icon(icon, 'g') + '<b>' + esc(title) + '</b>' +
			'<span class="cnt">' + cntHTML(c, c.props) + UI.icon('chevron', 'chev') + '</span></div>' +
			'<div class="rows">' + (open ? kids : '') + '</div></div>';
	}

	function layerCards(L, single, q) {
		var html = cardHTML(L.attrsId, 'layer · ' + (TYPE_NAME[L.type] || L.type), 'attrs', single, q);
		L.groups.forEach(function (g, i) {
			var t = GROUP_TITLE[g.mn] || [g.name.toLowerCase(), 'layers'];
			var def = single && (g.mn === 'ADBE Transform Group' || g.mn === 'ADBE Root Vectors Group' || g.mn === 'ADBE Text Properties' || i === 0);
			html += cardHTML(g.id, t[0], t[1], def, q);
		});
		if (L.markers.length) html += cardHTML(L.markersId, 'markers', 'marker', false, q);
		return html;
	}

	function layerHTML(L, defOpen, q) {
		if (!visible(L.id, q)) return '';
		var open = q ? true : isOpen(L.id, defOpen);
		var c = counts(L.id);
		return '<div class="lyr' + (open ? '' : ' closed') + '">' +
			'<div class="layer-head' + (excluded(L.id) ? ' off' : '') + '" data-toggle="' + L.id + '">' + cbHTML(L.id) +
			'<span class="ltype t-' + L.type + '">' + (TYPE_LABEL[L.type] || '') + '</span><span class="lname">' + esc(L.name) + '</span>' +
			'<span class="cnt">' + cntHTML(c) + '<i class="faint">#' + L.index + '</i>' + UI.icon('chevron', 'chev') + '</span></div>' +
			(open ? '<div class="lyr-kids">' + layerCards(L, false, q) + '</div>' : '') + '</div>';
	}

	function compHTML(C, inScript, q) {
		var c = counts(C.key);
		var html = '<div class="comp-head' + (inScript ? '' : ' off') + '">' + cbHTML(C.key, C.root) +
			'<span class="ltype t-comp">COMP</span><span class="lname">' + esc(C.name) + '<small>' + (C.root ? 'principal' : 'precomp') + '</small></span>' +
			'<span class="cnt">' + cntHTML(c) + '<i>' + plural(c.layers, 'layer', 'layers') + '</i></span></div>';
		if (!inScript) {
			return html + '<div class="comp-note">' + (state.ex[C.key] ? 'desmarcada: as layers que usam esta comp procuram a original no projeto pelo nome.' : 'fora do script: só é usada por uma precomp desmarcada.') + '</div>';
		}
		html += cardHTML(C.settingsId, 'comp · configurações', 'monitor', false, q);
		if (C.markers.length) html += cardHTML(C.markersId, 'markers da comp', 'marker', false, q);
		C.layers.forEach(function (L) { html += layerHTML(L, false, q); });
		return html;
	}

	function renderTree() {
		var m = state.m;
		var q = $('query').value.trim().toLowerCase();
		var html = '';
		if (m.mode === 'comp') {
			var inScript = {};
			CG.compsIn(m, state.ex).forEach(function (C) { inScript[C.key] = true; });
			// a principal primeiro, depois as precomps de fora para dentro
			m.comps.slice().reverse().forEach(function (C) { html += compHTML(C, inScript[C.key], q); });
		} else {
			var layers = m.rootComp.layers;
			if (layers.length === 1) html = layerCards(layers[0], true, q);
			else layers.forEach(function (L) { html += layerHTML(L, true, q); });
		}
		if (!html) html = '<div class="empty" style="padding:24px"><small>nada encontrado para “' + esc(q) + '”</small></div>';
		$('tree').innerHTML = html;
	}

	// avisos sobre o que pode dar diferença em outro projeto / computador
	function computeWarnings() {
		var m = state.m, ex = state.ex;
		var out = [], seen = {}, fonts = {}, fx = {};
		var add = function (w) { if (!seen[w]) { seen[w] = true; out.push(w); } };
		var inScript = {};
		CG.compsIn(m, ex).forEach(function (C) { inScript[C.id] = true; });

		CG.compsIn(m, ex).forEach(function (C) {
			CG.layersIn(C, ex).forEach(function (L) {
				L.warnings.forEach(add);
				var src = L.source;
				if (L.type === 'footage') add('“' + L.name + '” usa “' + src.name + '”: o script procura esse item no projeto pelo nome' + (src.file ? ' (ou importa o arquivo original)' : '') + '.');
				if (L.type === 'precomp' && !(m.mode === 'comp' && inScript[src.id])) add('“' + L.name + '” usa a precomp “' + src.name + '”: o script procura essa comp no projeto pelo nome.');
				(function walk(list) {
					list.forEach(function (n) {
						if (ex[n.id]) return;
						if (n.fx && !NATIVE_FX.test(n.mn)) fx[n.name + ' (' + n.mn + ')'] = true;
						if (n.mn === 'ADBE Text Document') [n.v].concat((n.keys || []).map(function (k) { return k.v; })).forEach(function (v) {
							if (v && v.doc) {
								if (v.doc.font) fonts[v.doc.font] = true;
								(v.doc.runs || []).forEach(function (r) { if (r.font) fonts[r.font] = true; });
							}
						});
						if (n.kids) walk(n.kids);
					});
				})(L.groups);
			});
		});
		var f = Object.keys(fonts), e = Object.keys(fx);
		if (f.length) add((f.length === 1 ? 'fonte usada: ' : 'fontes usadas: ') + f.join(', ') + '. precisam estar instaladas onde o script rodar.');
		if (e.length) add((e.length === 1 ? 'efeito que pode ser plug-in de terceiro: ' : 'efeitos que podem ser plug-ins de terceiros: ') + e.join(', ') + '.');
		return out;
	}

	function renderSummary() {
		var m = state.m;
		var st = CG.stats(m, opts());
		var code = CG.generate(m, opts());
		state.code = code;
		var lines = code.split('\n').length;

		var badge = $('propBadge');
		var prev = badge.textContent;
		badge.textContent = st.props;
		badge.classList.remove('hidden');
		if (prev && prev !== String(st.props)) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }

		var parts = [];
		if (m.mode === 'comp') {
			parts.push('<b>' + st.comps + '</b> ' + (st.comps === 1 ? 'comp' : 'comps'));
			parts.push(plural(st.layers, 'layer', 'layers'));
		} else parts.push('<b>' + st.layers + '</b> ' + (st.layers === 1 ? 'layer' : 'layers'));
		parts.push(plural(lines, 'linha', 'linhas'));
		if (st.keys && S.keys) parts.push(plural(st.keys, 'key', 'keys'));
		$('sumText').innerHTML = UI.icon(m.mode === 'comp' ? 'monitor' : 'layers') + parts.join('<span class="sep">·</span>');

		state.warnings = computeWarnings();
		var pill = $('warnPill');
		pill.classList.toggle('hidden', !state.warnings.length);
		pill.querySelector('span').textContent = plural(state.warnings.length, 'aviso', 'avisos');
		UI.setTip(pill, plural(state.warnings.length, 'aviso', 'avisos') + '\nclique para ver');

		if (m.mode === 'comp') $('runTxt').textContent = st.comps > 1 ? 'recriar comp + ' + plural(st.comps - 1, 'precomp', 'precomps') : 'recriar comp';
		else $('runTxt').textContent = st.layers > 1 ? 'recriar ' + st.layers + ' layers' : 'recriar layer';
		$('runBtn').disabled = m.mode === 'layers' && !st.layers;

		var first = CG.layersIn(m.rootComp, state.ex)[0] || m.rootComp.layers[0];
		$('fnHint').textContent = S.wrap ? (first ? 'criar_' + CG.snake(first.name) + '(comp)' : 'uma função por layer') : 'código corrido, sem funções';
		$('targetRow').classList.toggle('hidden', m.mode === 'comp');
		$('compRow').classList.toggle('hidden', m.mode !== 'comp');
	}

	// ------------------------------------------------------- código --------
	var TOKEN = /(\/\/.*$)|('(?:[^'\\]|\\.)*')|(\b(?:var|function|return|if|else|try|catch|for|new|true|false|null|in)\b)|(\bbin\.\w+|\b(?:app|comp)\b)|(-?\b\d+(?:\.\d+)?\b)/g;
	var MAX_PREVIEW_LINES = 4000;

	function highlight(line) {
		var out = '', last = 0, mt;
		TOKEN.lastIndex = 0;
		while ((mt = TOKEN.exec(line))) {
			out += esc(line.slice(last, mt.index));
			var cls = mt[1] ? 'c' : mt[2] ? 's' : mt[3] ? 'k' : mt[4] ? 'f' : 'n';
			out += '<span class="tk-' + cls + '">' + esc(mt[0]) + '</span>';
			last = TOKEN.lastIndex;
		}
		return out + esc(line.slice(last));
	}

	function renderCode() {
		if (!state.m) {
			$('codeView').innerHTML = '<span class="l"><span class="tk-c">// capture uma layer ou uma comp na aba propriedades</span></span>';
			$('lineCount').textContent = '';
			$('fileName').textContent = '';
			return;
		}
		var lines = (state.code || CG.generate(state.m, opts())).split('\n');
		var start = -1, end = -1;
		lines.forEach(function (l, i) {
			if (start < 0 && /\/\/ ---- funções auxiliares do BIN/.test(l)) start = i;
			if (start >= 0 && end < 0 && i > start && /^\t\};$/.test(l)) end = i;
		});
		var html = [];
		for (var i = 0; i < lines.length && html.length < MAX_PREVIEW_LINES; i++) {
			if (i === start && !state.helpersOpen && end > start) {
				html.push('<span class="fold" id="foldHelpers" title="mostrar as funções auxiliares">funções auxiliares do BIN · ' + (end - start + 1) + ' linhas</span>');
				i = end;
				continue;
			}
			html.push('<span class="l">' + (highlight(lines[i]) || ' ') + '</span>');
		}
		if (i < lines.length) html.push('<span class="l"><span class="tk-c">// … mais ' + (lines.length - i) + ' linhas: use copiar ou exportar</span></span>');
		$('codeView').innerHTML = html.join('');
		$('codeBox').classList.toggle('wrap', S.codeWrap);
		$('lineCount').textContent = plural(lines.length, 'linha', 'linhas');
		$('fileName').textContent = fileName();
		var fold = $('foldHelpers');
		if (fold) fold.onclick = function () { state.helpersOpen = true; renderCode(); };
	}

	function fileName() {
		var m = state.m;
		if (m.mode === 'comp') return 'criar_comp_' + CG.snake(m.rootComp.name) + '.jsx';
		var L = CG.layersIn(m.rootComp, state.ex);
		return 'criar_' + CG.snake(L.length === 1 ? L[0].name : m.rootComp.name) + '.jsx';
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
			// sem o diálogo do CEP (versões antigas): o After Effects salva
			if (!BIN.isCEP || (global.cep && global.cep.fs && global.cep.fs.showSaveDialogEx)) return null;
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
		clearTimeout(resetRun.t);
		if (!b.classList.contains('done') && !b.classList.contains('working')) return;
		b.classList.remove('done', 'working');
		b.querySelector('.ico').outerHTML = UI.icon('sparkle');
	}

	function runMessage(r) {
		var errs = r.errors || [];
		var msg;
		if (state.m.mode === 'comp') {
			var pre = (r.comps || []).length - 1;
			msg = 'comp <b>' + esc(r.comp) + '</b> criada com ' + plural(r.count || 0, 'layer', 'layers') + (pre > 0 ? ' e ' + plural(pre, 'precomp', 'precomps') : '') + '.';
		} else {
			var names = r.layers || [];
			msg = (names.length === 1 ? '<b>' + esc(names[0]) + '</b> criada' : '<b>' + names.length + '</b> layers criadas') + (r.comp ? ' em “' + esc(r.comp) + '”.' : '.');
		}
		if (errs.length) msg += ' ' + plural(errs.length, 'propriedade não pôde ser aplicada:', 'propriedades não puderam ser aplicadas:');
		return msg;
	}

	function run() {
		var b = $('runBtn');
		if (b.classList.contains('working')) return;
		if (b.classList.contains('done')) { resetRun(); return; }
		var code = CG.generate(state.m, opts());
		UI.hideToast();
		b.classList.add('working');
		$('runTxt').textContent = 'recriando…';

		var tmp = BIN.fs.tmpFile('bin_run.jsx');
		var p = tmp && BIN.fs.writeText(tmp, code) ? BIN.callHostJSON('bin_runFile', [tmp]) : BIN.callHostJSON('bin_run', [code]);

		p.then(function (r) {
			b.classList.remove('working');
			b.classList.add('done');
			b.querySelector('.ico').outerHTML = UI.icon('check');
			$('runTxt').textContent = state.m.mode === 'comp' ? 'comp criada' : ((r.layers || []).length > 1 ? r.layers.length + ' layers criadas' : 'layer criada');
			var errs = r.errors || [];
			UI.toast(runMessage(r), errs.length ? 'warn' : 'ok', {
				sticky: true,
				details: errs,
				actions: [
					{ label: 'desfazer', icon: 'undo', run: function () { BIN.callHostJSON('bin_undo').then(function () { UI.toast('desfeito.', 'info', { life: 1400 }); resetRun(); renderSummary(); }); } },
					{ label: 'exportar .jsx', icon: 'save', run: function () { saveText(code, fileName()); } }
				]
			});
			resetRun.t = setTimeout(function () { resetRun(); renderSummary(); }, 4000);
		}).catch(function (e) {
			b.classList.remove('working');
			renderSummary();
			UI.toast(esc(e.message), 'error', { sticky: true });
		});
	}

	// ----------------------------------------------------- utilitários -----
	function showOut(which, code, info) {
		state.tools[which] = code;
		var box = $(which + 'Out');
		box.classList.remove('hidden');
		box.querySelector('pre').textContent = code.length > 20000 ? code.slice(0, 20000) + '\n… (' + CG.size(code.length) + ' no total: use copiar ou exportar)' : code;
		$(which + 'Info').textContent = info;
	}

	function getExpressions() {
		BIN.callHostJSON('bin_expressions').then(function (r) {
			showOut('expr', CG.expressions(r.items), plural(r.items.length, 'expressão', 'expressões'));
		}).catch(function (e) { UI.toast(esc(e.message), 'error'); });
	}

	function convertFiles(list) {
		Promise.all(list.map(function (f) {
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
	function bindTree() {
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
			if (!t) return;
			var id = t.dataset.toggle;
			var el = t.parentNode;
			var open = el.classList.contains('closed');
			state.open[id] = open;
			// o conteúdo fechado não é desenhado (comps grandes): redesenha ao abrir
			if (open) renderTree();
			else el.classList.add('closed');
		});
		$('query').addEventListener('input', renderTree);
		$('expandAll').onclick = function () { Object.keys(state.nodes).forEach(function (id) { state.open[id] = true; }); renderTree(); };
		$('collapseAll').onclick = function () { Object.keys(state.nodes).forEach(function (id) { state.open[id] = false; }); renderTree(); };
	}

	function bindOptions() {
		function toggle(btn, key) {
			btn.classList.toggle('on', !!S[key]);
			btn.onclick = function () {
				S[key] = !S[key];
				saveSettings();
				btn.classList.toggle('on', S[key]);
				if (state.m) changed();
			};
		}
		toggle($('optKeys'), 'keys');
		toggle($('optExpr'), 'expr');

		function sw(el, key) {
			el.checked = !!S[key];
			el.onchange = function () { S[key] = el.checked; saveSettings(); if (state.m) changed(); };
		}
		sw($('optWrap'), 'wrap');
		sw($('optParent'), 'parent');
		sw($('optComments'), 'comments');

		var seg = $('targetSeg');
		var setTarget = function (v) { each(seg.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.value === v); }); };
		setTarget(S.target);
		seg.onclick = function (e) {
			var b = e.target.closest('button');
			if (!b) return;
			S.target = b.dataset.value; saveSettings(); setTarget(S.target);
			if (state.m) changed();
		};

		setMode(S.mode);
		$('modeSeg').onclick = function (e) {
			var b = e.target.closest('button');
			if (!b || b.dataset.value === (state.m && state.m.mode)) return;
			setMode(b.dataset.value);
			capture(false);
		};
	}

	function bindCode() {
		$('wrapBtn').classList.toggle('on', S.codeWrap);
		$('wrapBtn').onclick = function () {
			S.codeWrap = !S.codeWrap;
			saveSettings();
			$('wrapBtn').classList.toggle('on', S.codeWrap);
			$('codeBox').classList.toggle('wrap', S.codeWrap);
		};
		$('copyBtn').onclick = function () { if (state.m) copyText(CG.generate(state.m, opts()), 'código'); };
		$('exportBtn').onclick = function () { if (state.m) saveText(CG.generate(state.m, opts()), fileName()); };
	}

	function bindTools() {
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
		// arquivo solto fora da área não deve abrir no painel
		document.addEventListener('dragover', function (e) { e.preventDefault(); });
		document.addEventListener('drop', function (e) { e.preventDefault(); });

		each(document.querySelectorAll('[data-copy]'), function (b) {
			b.onclick = function () { copyText(state.tools[b.dataset.copy], b.dataset.copy === 'expr' ? 'expressão' : 'código'); };
		});
		each(document.querySelectorAll('[data-save]'), function (b) {
			b.onclick = function () { saveText(state.tools[b.dataset.save], b.dataset.save === 'expr' ? 'expressoes.jsxinc' : state.tools.binName); };
		});
	}

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
		$('captureBtn').onclick = function () { setMode('layers'); capture(false); };
		$('captureCompBtn').onclick = function () { setMode('comp'); capture(false); };
		$('runBtn').onclick = run;
		$('warnPill').onclick = function () {
			UI.toast(plural(state.warnings.length, 'aviso', 'avisos') + ' sobre o script gerado:', 'warn', { sticky: true, details: state.warnings });
		};

		bindTree();
		bindOptions();
		bindCode();
		bindTools();
		renderCode();
		capture(true);
	}

	BIN.app = { capture: capture, showTab: showTab, state: state };

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
	else bind();
})(window);
