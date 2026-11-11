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
	var DEFAULTS = { theme: 'auto', tab: 'props', mode: 'layers', target: 'active', wrap: true, parent: true, comments: true, keys: true, expr: true, codeWrap: false };
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
		ed: { edited: false, scratch: false, file: null },   // editor da aba código
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

	// tradução (i18n/textos.csv): T(texto em português, ...valores para {0}, {1}…)
	var T = BIN.t;
	function plural(n, one, many) { return n + ' ' + T(n === 1 ? one : many); }
	function typeName(type) { return T(TYPE_NAME[type] || type); }

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
		if (typeof v === 'boolean') return T(v ? 'sim' : 'não');
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
		UI.setTip($('themeBtn'), T(THEME_LABEL[S.theme]) + '\n' + T('clique para trocar'));
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
		if (S.tab !== name) { S.tab = name; saveSettings(); } // o painel abre na última aba usada
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
				if (C.egp.length) {
					reg(C.egpId, C.key, 'egp', C);
					C.egp.forEach(function (e) { reg(e.id, C.egpId, 'ctrl', e); });
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
				if (L.overrides.length) {
					reg(L.overridesId, L.id, 'overrides', L);
					L.overrides.forEach(function (o) { reg(o.id, L.overridesId, 'override', o); });
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
		return { target: S.target, wrap: S.wrap, parent: S.parent, comments: S.comments, keys: S.keys, expr: S.expr, excluded: state.ex, ffx: ffxMap() };
	}

	// ---------------------------------------------------- captura ----------
	function capture(quiet) {
		var logo = $('logo');
		logo.classList.remove('spin'); void logo.offsetWidth; logo.classList.add('spin');
		var mode = S.mode;
		return BIN.callHostJSON(mode === 'comp' ? 'bin_captureComp' : 'bin_capture').then(function (raw) {
			state.raw = JSON.parse(JSON.stringify(raw)); // cópia antes de preparar (o pacote de documentação usa a captura original)
			state.m = CG.prepare(raw);
			state.ex = {};
			state.open = {};
			state.focus = null;
			state.ed.edited = false;
			state.ed.file = null;
			indexNodes();
			document.body.classList.remove('is-empty');
			$('empty').classList.add('hidden');
			$('propsView').classList.remove('hidden');
			resetRun();
			render();
			markSeen(true);
			var m = state.m, msg = null;
			if (!quiet) {
				if (m.mode === 'comp') {
					var pre = m.comps.length - 1;
					msg = pre ? T('comp “{0}” capturada com {1}.', esc(m.rootComp.name), plural(pre, 'precomp', 'precomps')) : T('comp “{0}” capturada.', esc(m.rootComp.name));
				} else msg = T('{0} de “{1}”.', plural(m.rootComp.layers.length, 'layer capturada', 'layers capturadas'), esc(m.rootComp.name));
			}
			if (!proposeFfx(msg) && msg) UI.toast(msg, 'ok', { life: 1800 });
		}).catch(function (e) {
			if (!quiet) UI.toast(esc(BIN.tr(e.message)), 'error');
		});
	}

	// ------------------------------------------------- seleção no AE ------
	// o painel pergunta a cada segundo o que está selecionado; se não bate com a captura, avisa (sem recapturar
	// sozinho: a captura de uma comp grande demora e as marcações feitas no painel se perderiam)
	var watch = { busy: false, sel: null, cap: '', ack: '' };

	function selKey(sel, mode) {
		if (!sel || !sel.comp) return '';
		if (mode === 'comp') return 'comp:' + sel.comp.id;
		return sel.comp.id + ':' + sel.layers.map(function (l) { return l.index + '.' + l.name; }).join('|');
	}

	function pollSelection() {
		if (watch.busy || document.hidden || $('runBtn').classList.contains('working')) return Promise.resolve(watch.sel);
		watch.busy = true;
		return BIN.callHostJSON('bin_selection').then(function (sel) {
			watch.busy = false;
			watch.sel = sel;
			renderSelection();
			return sel;
		}, function () { watch.busy = false; return null; });
	}

	// o que acabou de ser capturado (ou criado pelo script) vira a referência
	function markSeen(asCapture) {
		watch.busy = false;
		return pollSelection().then(function (sel) {
			if (!sel) return;
			var key = selKey(sel, state.m ? state.m.mode : S.mode);
			if (asCapture) { watch.cap = key; watch.ack = ''; } else watch.ack = key;
			renderSelection();
		});
	}

	function selLabel(sel) {
		var n = sel.layers.length;
		return n === 1 ? '“' + esc(sel.layers[0].name) + '”' : plural(n, 'layer', 'layers');
	}

	function renderSelection() {
		var sel = watch.sel;
		if (!state.m) {
			// tela inicial: mostra o que vai ser capturado
			var n = sel && sel.comp ? sel.layers.length : 0;
			$('emptyTitle').textContent = !sel || !sel.comp ? T('abra uma comp e selecione uma layer') : n ? T('{0} em “{1}”', plural(n, 'layer selecionada', 'layers selecionadas'), sel.comp.name) : T('selecione uma layer em “{0}”', sel.comp.name);
			$('captureTxt').textContent = n === 1 ? T('capturar “{0}”', sel.layers[0].name) : n > 1 ? T('capturar {0}', plural(n, 'layer', 'layers')) : T('capturar seleção');
			$('captureBtn').disabled = !n;
			$('captureCompBtn').disabled = !(sel && sel.comp);
			return;
		}
		var mode = state.m.mode, stale = false, txt = '', tip = '';
		if (sel && sel.comp) {
			var key = selKey(sel, mode);
			if (mode === 'comp') stale = key !== watch.cap && key !== watch.ack;
			else stale = sel.layers.length > 0 && key !== watch.cap && key !== watch.ack;
			txt = mode === 'comp' ? T('atualizar para a comp “{0}”', esc(sel.comp.name)) : T('atualizar para {0}', selLabel(sel));
			var tip = mode === 'comp' ? T('a comp ativa agora é “{0}”', sel.comp.name)
				: T('selecionado agora em “{0}”:', sel.comp.name) + '\n' + sel.layers.slice(0, 8).map(function (l) { return '• ' + l.name; }).join('\n') + (sel.layers.length > 8 ? '\n…' : '');
		}
		var chip = $('chip');
		chip.classList.toggle('stale', stale);
		$('chipMeta').innerHTML = stale ? txt : esc(chip.dataset.meta || '');
		UI.setTip(chip, stale ? T('a captura ficou para trás') + '\n' + tip + '\n' + T('clique para capturar de novo') : T('atualizar a captura\nlê de novo a seleção (ou a comp inteira) no After Effects'));
	}

	function setMode(mode) {
		S.mode = mode;
		saveSettings();
		each($('modeSeg').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.value === mode); });
	}

	// ------------------------------------------------------ render ---------
	// ------------------------------------------------- pseudo effects -----
	// o .ffx de cada pseudo effect, salvo pelo próprio AE; o caminho fica guardado (S.ffx) e os bytes vão para o script
	var ffxCache = {};
	function ffxBytes(mn) {
		var p = S.ffx && S.ffx[mn];
		if (!p) return null;
		if (ffxCache[mn] && ffxCache[mn].path === p) return ffxCache[mn].bytes;
		try {
			var b = BIN.fs.readBinary(p);
			if (!b || !b.length) return null;
			ffxCache[mn] = { path: p, bytes: b };
			return b;
		} catch (e) { return null; }
	}

	function ffxMap() {
		var out = {};
		if (state.m) CG.pseudoEffects(state.m).forEach(function (p) { var b = ffxBytes(p.mn); if (b) out[p.mn] = b; });
		return out;
	}

	function useFfx(mn, path, quiet) {
		S.ffx = S.ffx || {};
		S.ffx[mn] = path;
		delete ffxCache[mn];
		saveSettings();
		var ok = !!ffxBytes(mn);
		if (!ok) { delete S.ffx[mn]; saveSettings(); UI.toast(T('não foi possível ler {0}.', esc(BIN.fs.basename(path))), 'error'); }
		else if (!quiet) UI.toast(T('<b>{0}</b> entra no script: o pseudo effect funciona em qualquer máquina.', esc(BIN.fs.basename(path))), 'ok', { life: 2600 });
		state.code = null;
		renderPseudo();
		if (state.m) { renderTree(); renderSummary(); }
		if (state.tab === 'code') renderCode();
		return ok;
	}

	// abre o Save Animation Preset do AE para um pseudo effect; resolve true se o .ffx entrou
	function savePseudo(p, quiet) {
		var at = p.at[0];
		if (!quiet) UI.toast(T('salve o .ffx de <b>{0}</b> no diálogo do After Effects…', esc(p.mn.replace(/^Pseudo\//, ''))), 'info', { life: 2600 });
		return BIN.callHostJSON('bin_savePseudo', [at.comp, at.layer, at.fx, p.mn]).then(function (r) {
			if (r.file) return useFfx(p.mn, r.file, quiet);
			if (!quiet) UI.toast(T('o .ffx foi salvo fora da pasta de presets (ou o diálogo foi cancelado).'), 'warn', {
				sticky: true,
				actions: [{ label: T('escolher o .ffx'), icon: 'open', run: function () { pickFfx(p); } }]
			});
			return false;
		}).catch(function (e) { UI.toast(esc(BIN.tr(e.message)), 'error', { sticky: true }); return false; });
	}

	// vários: um diálogo de cada vez, e um resumo no fim
	function saveAllPseudo(list) {
		if (list.length === 1) return savePseudo(list[0]);
		var done = 0, i = 0;
		var next = function () {
			if (i >= list.length) {
				var miss = list.filter(function (p) { return !ffxBytes(p.mn); });
				UI.toast(miss.length ? T('{0} de {1} .ffx salvos. faltam: {2} (escolha o arquivo na aba utilitários).', done, list.length, miss.map(function (p) { return esc(p.mn.replace(/^Pseudo\//, '')); }).join(', ')) : T('{0} de {1} .ffx salvos: entram no script.', done, list.length), miss.length ? 'warn' : 'ok', { sticky: !!miss.length, life: 3200 });
				return Promise.resolve(done);
			}
			var p = list[i++];
			UI.toast(T('salvando {0} de {1}: <b>{2}</b> (diálogo do After Effects)…', i, list.length, esc(p.mn.replace(/^Pseudo\//, ''))), 'info', { sticky: true });
			return savePseudo(p, true).then(function (ok) { if (ok) done++; return next(); });
		};
		return next();
	}

	// pseudo effects da captura ainda sem .ffx (os que já foram propostos nesta sessão não voltam)
	var ffxAsked = {};
	function proposeFfx(captureMsg) {
		if (!state.m) return false;
		var list = CG.pseudoEffects(state.m).filter(function (p) { return !ffxBytes(p.mn) && !ffxAsked[p.mn]; });
		if (!list.length) return false;
		list.forEach(function (p) { ffxAsked[p.mn] = true; });
		var names = list.map(function (p) { return '<b>' + esc(p.mn.replace(/^Pseudo\//, '')) + '</b>'; });
		var msg = (captureMsg ? captureMsg + ' ' : '') + (list.length === 1 ? T('o pseudo effect {0} ainda não tem .ffx: salve para incorporar no código, e o script funciona em qualquer máquina.', names[0]) : T('{0} pseudo effects ainda não têm .ffx ({1}): salve para incorporar no código, e o script funciona em qualquer máquina.', list.length, names.join(', ')));
		UI.toast(msg, 'info', {
			sticky: true,
			actions: [
				{ label: list.length === 1 ? T('salvar .ffx') : T('salvar os {0}', list.length), icon: 'save', run: function () { UI.hideToast(); saveAllPseudo(list); } },
				{ label: T('agora não'), icon: 'x', run: UI.hideToast }
			]
		});
		return true;
	}

	function pickFfx(p) {
		BIN.dialog.openFiles(T('escolha o .ffx de {0}', p.name), ['ffx'], true).then(function (paths) {
			if (paths && paths.length) useFfx(p.mn, paths[0]);
		});
	}

	function renderPseudo() {
		var list = state.m ? CG.pseudoEffects(state.m) : [];
		$('pseudoNone').classList.toggle('hidden', !!list.length);
		state.pseudo = list;
		$('pseudoList').innerHTML = list.map(function (p, i) {
			var has = !!ffxBytes(p.mn);
			var where = p.at.map(function (a) { return a.layerName; }).filter(function (n, k, all) { return all.indexOf(n) === k; }).join(', ');
			return '<div class="pseudo-item' + (has ? ' ok' : '') + '">' +
				'<div class="pseudo-head"><b>' + esc(p.mn.replace(/^Pseudo\//, '')) + '</b><small>' + esc(where) + '</small></div>' +
				'<div class="pseudo-state">' + (has
					? UI.icon('check') + '<span>' + T('{0} · entra no script', esc(BIN.fs.basename(S.ffx[p.mn]))) + '</span>'
					: UI.icon('alert') + '<span>' + T('sem .ffx: o script só cria o efeito onde ele estiver instalado') + '</span>') + '</div>' +
				'<div class="pseudo-acts">' +
				'<button class="btn small" data-pseudo-save="' + i + '" title="' + esc(T('salvar .ffx\nabre o “Save Animation Preset” do After Effects com o efeito selecionado')) + '"><i data-icon="save"></i>' + T(has ? 'salvar de novo' : 'salvar .ffx') + '</button>' +
				'<button class="btn small ghost" data-pseudo-pick="' + i + '" title="' + esc(T('escolher .ffx\nusa um .ffx que você já tem')) + '"><i data-icon="open"></i>' + T('escolher .ffx') + '</button>' +
				'</div></div>';
		}).join('');
		UI.hydrateIcons($('pseudoList'));
	}

	function render() {
		setMode(state.m.mode);
		renderChip();
		renderTree();
		renderSummary();
		renderPseudo();
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
			t.textContent = T(TYPE_LABEL[L.type] || 'LAYER');
			t.className = 'ltype t-' + L.type;
			$('chipName').textContent = L.name;
			meta = [C.name, plural(st.props, 'prop', 'props')];
		} else {
			t.textContent = T('{0} LAYERS', C.layers.length);
			t.className = 'ltype t-multi';
			$('chipName').textContent = C.layers.map(function (l) { return l.name; }).join(', ');
			meta = [C.name, plural(st.props, 'prop', 'props')];
		}
		if (st.keys) meta.push(plural(st.keys, 'key', 'keys'));
		if (st.expr) meta.push(T('{0} expr', st.expr));
		$('chip').dataset.meta = meta.join(' · ');
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
			} else if (n.kind === 'attr' || n.kind === 'marker' || n.kind === 'csetting' || n.kind === 'cinfo' || n.kind === 'ctrl' || n.kind === 'override') {
				c.props++;
				if (n.kind === 'override' && n.node.x) c.expr++;
			}
			else if (n.kind === 'layer') c.layers++;
			n.kids.forEach(walk);
		})(id);
		return c;
	}

	function cntHTML(c, total) {
		var h = '';
		if (c.keys) h += '<i title="' + T('keyframes') + '"><span class="dot k"></span>' + c.keys + '</i>';
		if (c.expr) h += '<i title="' + T('expressões') + '"><span class="dot e"></span>' + c.expr + '</i>';
		if (total !== undefined) h += '<i>' + total + '</i>';
		return h;
	}

	// olho no fim da linha: aparece ao passar o mouse; fica fixo quando algo está fora do script
	function eyeHTML(id, locked) {
		if (locked) return '<span class="eye-sp"></span>';
		var on = !excluded(id);
		var mixed = on && anyExcludedBelow(id);
		var tip = T(!on ? 'fora do script\nclique para incluir' : mixed ? 'parte está fora do script\nclique para incluir tudo' : 'no script\nclique para tirar');
		return '<button class="eye' + (!on ? ' off' : mixed ? ' mixed' : '') + '" data-id="' + id + '" title="' + tip + '">' + UI.icon(on ? 'eye' : 'eyeOff') + '</button>';
	}

	function isOpen(id, def) { return id in state.open ? state.open[id] : def; }

	function label(n) {
		switch (n.kind) {
			case 'attr': return T(ATTR_LABEL[n.node.key] || n.node.key);
			case 'csetting':
			case 'cinfo': return T(COMP_LABEL[n.node.key] || n.node.key);
			case 'marker': return n.node.comment || '';
			case 'ctrl': return n.node.name;
			case 'override': return n.node.names.join(' › ');
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
				if (v.sep) val = T('dimensões separadas');
				else if (v.keys) val = keysHTML(v.keys) + '<span class="vt">' + preview(v.keys[0].v, v.mn) + '</span>';
				else val = preview(v.v, v.mn);
				if (v.add && v.v === undefined && !v.keys) val = '<span class="faint">' + T('adicionada') + '</span>';
				if (v.x) val = '<span class="xf' + (S.expr ? '' : ' dis') + '" title="' + T(v.xoff ? 'expressão (desligada)' : 'expressão') + '\n' + esc(v.x.split(/\r|\n/)[0].slice(0, 80)) + '">ƒ</span>' + val;
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
				return '<span class="vt">' + (v.comment ? '"' + esc(v.comment) + '"' : '<span class="faint">' + T('sem comentário') + '</span>') + '</span>';
			case 'ctrl':
				if (v.missing) return '<span class="faint">' + T('origem desconhecida') + '</span>';
				return '<span class="vt">' + esc(v.layer.name) + ' › ' + esc(v.path[v.path.length - 1].name) + '</span>';
			case 'override': {
				var ov = v.v !== undefined ? preview(v.v) : '<span class="faint">' + T('igual à da precomp') + '</span>';
				if (v.x) ov = '<span class="xf' + (S.expr ? '' : ' dis') + '" title="' + T(v.xoff ? 'expressão (desligada)' : 'expressão') + '\n' + esc(v.x.split(/\r|\n/)[0].slice(0, 80)) + '">ƒ</span>' + ov;
				return ov;
			}
		}
		return '';
	}

	function fixedKind(n) { return n.kind === 'cinfo' || n.kind === 'group'; }

	// pseudo effect: selo .ffx (verde quando entra no script; senão, botão para salvar)
	function ffxTag(g) {
		if (!g.pseudo) return '';
		var has = !!ffxBytes(g.mn);
		return '<button class="ffx-tag' + (has ? ' ok' : '') + '" data-ffx="' + esc(g.mn) + '" title="' + esc(T(has
			? '.ffx no script\no pseudo effect funciona em qualquer máquina; clique para salvar de novo'
			: 'sem .ffx\nclique para salvar o .ffx pelo After Effects e incorporar no código')) + '">' + (has ? UI.icon('check') : UI.icon('save')) + '.ffx</button>';
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
			return '<div class="grp' + (open ? '' : ' closed') + '"><div class="row group' + off + hit + '" data-toggle="' + id + '"' + d + '>' +
				'<span class="tw">' + UI.icon('chevron', 'chev') + '</span><span class="n">' + esc(g.name) + (g.off ? '<small>' + T('desligado') + '</small>' : '') + '</span><span class="cnt">' + cntHTML(counts(id)) + '</span>' + ffxTag(g) + eyeHTML(id) + '</div>' +
				'<div class="grp-kids">' + n.kids.map(function (k) { return rowHTML(k, depth + 1, q); }).join('') + '</div></div>';
		}

		var name = n.kind === 'marker' ? fmtTime(n.node.t) : esc(label(n));
		var title = '';
		if (!fixedKind(n)) {
			var tipLines = [label(n)];
			if (n.kind === 'ctrl') tipLines.push(n.node.missing ? T('este After Effects não diz de onde vem o controle (precisa do AE 2022 ou mais novo)') : T('controle do essential graphics: {0}', n.node.layer.name + ' › ' + n.node.path.map(function (s) { return s.name; }).join(' › ')) + (n.node.group ? '\n' + T('grupo “{0}” (grupos não são recriados)', n.node.group) : ''));
			if (n.kind === 'override') {
				if (n.node.v !== undefined) tipLines.push(T('valor mudado nas essential properties desta layer'));
				if (n.node.x) tipLines.push('• ' + T(n.node.xoff ? 'expressão (desligada)' : 'expressão') + ': ' + n.node.x.split(/\r|\n/)[0].slice(0, 60));
			}
			if (n.kind === 'prop') {
				tipLines.push(n.node.mn);
				if (n.node.keys) tipLines.push('• ' + plural(n.node.keys.length, 'keyframe', 'keyframes'));
				if (n.node.x) tipLines.push('• ' + T(n.node.xoff ? 'expressão (desligada)' : 'expressão') + ': ' + n.node.x.split(/\r|\n/)[0].slice(0, 60));
			}
			tipLines.push(T(excluded(id) ? 'clique para incluir no script' : 'clique para tirar do script'));
			title = ' title="' + esc(tipLines.join('\n')) + '"';
		}
		// a linha inteira liga / desliga (tamanho, duração e fps da comp sempre entram)
		var fixed = n.kind === 'cinfo';
		return '<div class="row' + (fixed ? '' : ' leaf') + off + hit + '"' + (fixed ? '' : ' data-id="' + id + '"') + d + title + '><span class="n">' + name + '</span><span class="v">' + rowValue(n) + '</span>' + eyeHTML(id, fixed) + '</div>';
	}

	function cardHTML(id, title, icon, defOpen, q) {
		if (!state.nodes[id] || !visible(id, q)) return '';
		var n = state.nodes[id];
		var open = q ? true : isOpen(id, defOpen);
		var c = counts(id);
		var kids = n.kind === 'prop' ? rowHTML(id, 0, q) : n.kids.map(function (k) { return rowHTML(k, 0, q); }).join('');
		return '<div class="card' + (open ? '' : ' closed') + (excluded(id) ? ' off' : '') + '">' +
			'<div class="card-head" data-toggle="' + id + '">' + UI.icon(icon, 'g') + '<b>' + esc(title) + '</b>' +
			'<span class="cnt">' + cntHTML(c, c.props) + '</span>' + (n.kind === 'prop' ? '' : eyeHTML(id)) + UI.icon('chevron', 'chev') + '</div>' +
			'<div class="rows">' + (open ? kids : '') + '</div></div>';
	}

	function layerCards(L, single, q) {
		var html = cardHTML(L.attrsId, T('layer · {0}', typeName(L.type)), 'attrs', single, q);
		L.groups.forEach(function (g, i) {
			var t = GROUP_TITLE[g.mn] ? [T(GROUP_TITLE[g.mn][0]), GROUP_TITLE[g.mn][1]] : [g.name.toLowerCase(), 'layers'];
			var def = single && (g.mn === 'ADBE Transform Group' || g.mn === 'ADBE Root Vectors Group' || g.mn === 'ADBE Text Properties' || i === 0);
			html += cardHTML(g.id, t[0], t[1], def, q);
		});
		if (L.markers.length) html += cardHTML(L.markersId, T('markers'), 'marker', false, q);
		if (L.overrides.length) html += cardHTML(L.overridesId, T('essential properties'), 'egp', false, q);
		return html;
	}

	function layerHTML(L, defOpen, q) {
		if (!visible(L.id, q)) return '';
		var open = q ? true : isOpen(L.id, defOpen);
		var c = counts(L.id);
		return '<div class="lyr' + (open ? '' : ' closed') + '">' +
			'<div class="layer-head' + (excluded(L.id) ? ' off' : '') + '" data-toggle="' + L.id + '">' +
			'<span class="ltype t-' + L.type + '">' + T(TYPE_LABEL[L.type] || '') + '</span><span class="lname">' + esc(L.name) + '</span>' +
			'<span class="cnt">' + cntHTML(c) + '<i class="faint">#' + L.index + '</i></span>' + eyeHTML(L.id) + UI.icon('chevron', 'chev') + '</div>' +
			(open ? '<div class="lyr-kids">' + layerCards(L, false, q) + '</div>' : '') + '</div>';
	}

	function compHTML(C, inScript, q) {
		var c = counts(C.key);
		var html = '<div class="comp-head' + (inScript ? '' : ' off') + '">' +
			'<span class="ltype t-comp">COMP</span><span class="lname">' + esc(C.name) + '<small>' + T(C.root ? 'principal' : 'precomp') + '</small></span>' +
			'<span class="cnt">' + cntHTML(c) + '<i>' + plural(c.layers, 'layer', 'layers') + '</i></span>' + eyeHTML(C.key, C.root) + '</div>';
		if (!inScript) {
			return html + '<div class="comp-note">' + T(state.ex[C.key] ? 'fora do script: as layers que usam esta comp procuram a original no projeto pelo nome.' : 'fora do script: só é usada por uma precomp desmarcada.') + '</div>';
		}
		html += cardHTML(C.settingsId, T('comp · configurações'), 'monitor', false, q);
		if (C.markers.length) html += cardHTML(C.markersId, T('markers da comp'), 'marker', false, q);
		if (C.egp.length) html += cardHTML(C.egpId, T('essential graphics') + (C.mgtName ? ' · ' + C.mgtName : ''), 'egp', false, q);
		var rows = C.layers.map(function (L) { return layerRowHTML(L, q); }).join('');
		if (rows) html += '<div class="card list"><div class="list-head">' + T('layers') + '<span class="faint">' + C.layers.length + '</span></div><div class="rows">' + rows + '</div></div>';
		return html;
	}

	// uma linha por layer: clicar abre o detalhe; o olho tira a layer do script
	function layerRowHTML(L, q) {
		if (!visible(L.id, q)) return '';
		var c = counts(L.id);
		var off = excluded(L.id) ? ' off' : '';
		var marks = '';
		if (c.keys) marks += '<i title="' + T('keyframes') + '"><span class="dot k"></span>' + c.keys + '</i>';
		if (c.expr) marks += '<i title="' + T('expressões') + '"><span class="dot e"></span>' + c.expr + '</i>';
		var tipLines = [L.name, typeName(L.type) + ' · #' + L.index];
		if (c.keys) tipLines.push('• ' + plural(c.keys, 'keyframe', 'keyframes'));
		if (c.expr) tipLines.push('• ' + plural(c.expr, 'expressão', 'expressões'));
		tipLines.push(T('clique para abrir'));
		return '<div class="row layer-row' + off + '" data-open="' + L.id + '" title="' + esc(tipLines.join('\n')) + '">' +
			'<span class="n">' + esc(L.name) + '</span>' +
			'<span class="cnt">' + marks + '</span><span class="lt">' + esc(typeName(L.type)) + '</span>' +
			eyeHTML(L.id) + UI.icon('chevron', 'go') + '</div>';
	}

	// detalhe de uma layer da comp: mesmo formato do modo layer, com "voltar"
	function focusHTML(L, C, q) {
		return '<button class="back" data-back="1">' + UI.icon('chevron', 'back-ico') + esc(C.name) + '</button>' +
			'<div class="focus-head' + (excluded(L.id) ? ' off' : '') + '"><span class="ltype t-' + L.type + '">' + T(TYPE_LABEL[L.type] || '') + '</span>' +
			'<span class="lname">' + esc(L.name) + '<small>#' + L.index + '</small></span>' + eyeHTML(L.id) + '</div>' +
			layerCards(L, true, q);
	}

	function renderTree() {
		var m = state.m;
		var q = $('query').value.trim().toLowerCase();
		var html = '';
		var focus = m.mode === 'comp' && state.focus && state.nodes[state.focus];
		if (focus) {
			var FC = m.comps.filter(function (C) { return C.layers.indexOf(focus.node) >= 0; })[0];
			html = focusHTML(focus.node, FC, q);
		} else if (m.mode === 'comp') {
			var inScript = {};
			CG.compsIn(m, state.ex).forEach(function (C) { inScript[C.key] = true; });
			// a principal primeiro, depois as precomps de fora para dentro
			m.comps.slice().reverse().forEach(function (C) { html += compHTML(C, inScript[C.key], q); });
		} else {
			var layers = m.rootComp.layers;
			if (layers.length === 1) html = layerCards(layers[0], true, q);
			else layers.forEach(function (L) { html += layerHTML(L, true, q); });
		}
		if (!html) html = '<div class="empty" style="padding:24px"><small>' + T('nada encontrado para “{0}”', esc(q)) + '</small></div>';
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
			(C.warnings || []).forEach(function (w) { add(BIN.tr(w)); });
			// controle do essential graphics cuja layer saiu do script
			if (C.egp && !ex[C.egpId]) {
				var inL = {};
				CG.layersIn(C, ex).forEach(function (L) { inL[L.index] = L; });
				C.egp.forEach(function (e) {
					if (!ex[e.id] && e.layer && !(inL[e.layer.index] && inL[e.layer.index].name === e.layer.name)) add(T('essential graphics: “{0}” fica de fora porque a layer “{1}” saiu do script.', e.name, e.layer.name));
					if (!ex[e.id] && e.group) add(T('essential graphics: o grupo “{0}” não é recriado (o After Effects não deixa criar grupos por script); os controles entram soltos.', e.group));
				});
			}
			CG.layersIn(C, ex).forEach(function (L) {
				L.warnings.forEach(function (w) { add(BIN.tr(w)); });
				var src = L.source;
				if (L.type === 'footage') add(T(src.file ? '“{0}” usa “{1}”: o script procura esse item no projeto pelo nome (ou importa o arquivo original).' : '“{0}” usa “{1}”: o script procura esse item no projeto pelo nome.', L.name, src.name));
				if (L.type === 'precomp' && !(m.mode === 'comp' && inScript[src.id])) add(T('“{0}” usa a precomp “{1}”: o script procura essa comp no projeto pelo nome.', L.name, src.name));
				(function walk(list) {
					list.forEach(function (n) {
						if (ex[n.id]) return;
						if (n.pseudo) {
							if (!ffxBytes(n.mn)) add(T('pseudo effect “{0}”: sem o .ffx, o script só cria o efeito onde ele estiver instalado. Salve o .ffx na aba utilitários.', n.mn.replace(/^Pseudo\//, '')));
						} else if (n.fx && !NATIVE_FX.test(n.mn)) fx[n.name + ' (' + n.mn + ')'] = true;
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
		if (f.length) add(f.length === 1 ? T('fonte usada: {0}. precisa estar instalada onde o script rodar.', f[0]) : T('fontes usadas: {0}. precisam estar instaladas onde o script rodar.', f.join(', ')));
		if (e.length) add(T(e.length === 1 ? 'efeito que pode ser plug-in de terceiro: {0}.' : 'efeitos que podem ser plug-ins de terceiros: {0}.', e.join(', ')));
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
		// a largura da aba acompanha o contador: o fundo da aba ativa precisa acompanhar também
		if (prev !== String(st.props)) placeTabInk();

		var parts = [];
		if (m.mode === 'comp') {
			parts.push('<b>' + st.comps + '</b> ' + T(st.comps === 1 ? 'comp' : 'comps'));
			parts.push(plural(st.layers, 'layer', 'layers'));
		} else parts.push('<b>' + st.layers + '</b> ' + T(st.layers === 1 ? 'layer' : 'layers'));
		parts.push(plural(lines, 'linha', 'linhas'));
		if (st.keys && S.keys) parts.push(plural(st.keys, 'key', 'keys'));
		$('sumText').innerHTML = UI.icon(m.mode === 'comp' ? 'monitor' : 'layers') + parts.join('<span class="sep">·</span>');

		state.warnings = computeWarnings();
		var pill = $('warnPill');
		pill.classList.toggle('hidden', !state.warnings.length);
		pill.querySelector('span').textContent = plural(state.warnings.length, 'aviso', 'avisos');
		UI.setTip(pill, plural(state.warnings.length, 'aviso', 'avisos') + '\n' + state.warnings.map(function (w) { return '• ' + w; }).join('\n') + '\n' + T('clique para ver tudo'));

		if (m.mode === 'comp') $('runTxt').textContent = st.comps > 1 ? T('recriar comp + {0}', plural(st.comps - 1, 'precomp', 'precomps')) : T('recriar comp');
		else $('runTxt').textContent = st.layers > 1 ? T('recriar {0}', plural(st.layers, 'layer', 'layers')) : T('recriar layer');
		$('runBtn').disabled = m.mode === 'layers' && !st.layers;
		updateRun();

		var first = CG.layersIn(m.rootComp, state.ex)[0] || m.rootComp.layers[0];
		$('fnHint').textContent = S.wrap ? (first ? T('criar_') + CG.snake(first.name) + '(comp)' : T('uma função por layer')) : T('código corrido, sem funções');
		$('targetRow').classList.toggle('hidden', m.mode === 'comp');
		$('compRow').classList.toggle('hidden', m.mode !== 'comp');
	}

	// ------------------------------------------------------- código --------
	var TOKEN = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b(?:var|function|return|if|else|try|catch|for|new|true|false|null|in)\b)|(\bbin\.\w+|\b(?:app|comp)\b)|(-?\b\d+(?:\.\d+)?\b)/g;
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

	// ------------------------------------------------------- editor --------
	// a aba código é um editor: com uma captura, mostra o código gerado (que pode ser editado);
	// sem captura, é um rascunho livre para digitar e executar qualquer script.
	// as funções auxiliares do BIN ficam numa linha só e voltam ao rodar, copiar e exportar.
	var HELPERS_START = /\/\/ ---- BIN:/; // o resto do comentário muda com o idioma
	var MARKER = /^([ \t]*)\/\/ ⋯ .*$/m;
	var SCRATCH_KEY = 'bin.scratch';
	var BIG = 3000; // acima disso, sem cores (o editor continua leve)

	function collapse(code) {
		var lines = code.split('\n'), start = -1, end = -1;
		lines.forEach(function (l, i) {
			if (start < 0 && HELPERS_START.test(l)) start = i;
			if (start >= 0 && end < 0 && i > start && /^[ \t]*\};$/.test(l)) end = i;
		});
		if (start < 0 || end < 0) return code;
		var indent = lines[start].match(/^[ \t]*/)[0];
		lines.splice(start, end - start + 1, indent + '// ⋯ ' + T('funções auxiliares do BIN ({0} linhas): entram ao rodar, copiar e exportar', end - start + 1));
		return lines.join('\n');
	}

	// devolve o código completo e onde as auxiliares entraram (para corrigir o número da linha dos erros)
	function expand(text) {
		var m = MARKER.exec(text);
		if (!m) return { code: text, at: 0, extra: 0 };
		var h = CG.helpers().split('\n');
		var block = h.map(function (l) { return l ? m[1] + l : ''; }).join('\n');
		return { code: text.slice(0, m.index) + block + text.slice(m.index + m[0].length), at: text.slice(0, m.index).split('\n').length, extra: h.length - 1 };
	}

	function editorText() { return $('codeEdit').value; }
	function freeMode() { return !state.m || state.ed.edited; }

	// o código que roda / copia / exporta
	function codeToRun() {
		if (!freeMode()) return { code: CG.generate(state.m, opts()), at: 0, extra: 0 };
		return expand(editorText());
	}

	function loadScratch() { try { return localStorage.getItem(SCRATCH_KEY) || ''; } catch (e) { return ''; } }
	function saveScratch() { try { localStorage.setItem(SCRATCH_KEY, editorText()); } catch (e) { } }

	var paintQueued = false;
	function paintEditor() {
		if (paintQueued) return;
		paintQueued = true;
		(global.requestAnimationFrame || setTimeout)(function () { paintQueued = false; paintNow(); });
	}

	function paintNow() {
		var lines = editorText().split('\n');
		var big = lines.length > BIG;
		$('codeView').innerHTML = lines.map(function (l) {
			if (MARKER.test(l)) { MARKER.lastIndex = 0; return '<span class="tk-fold">' + esc(l) + '</span>'; }
			return big ? esc(l) : highlight(l);
		}).join('\n') + '\n ';
		var g = [];
		for (var i = 1; i <= lines.length; i++) g.push(i);
		$('gutter').textContent = g.join('\n') + '\n ';
		$('lineCount').textContent = plural(lines.length, 'linha', 'linhas');
		syncScroll();
	}

	function syncScroll() {
		var t = $('codeEdit');
		$('codeView').scrollTop = t.scrollTop;
		$('codeView').scrollLeft = t.scrollLeft;
		$('gutter').scrollTop = t.scrollTop;
	}

	function setEditor(text) {
		$('codeEdit').value = text;
		paintNow();
	}

	function renderCode() {
		$('codeBox').classList.toggle('wrap', S.codeWrap);
		$('codeEdit').setAttribute('wrap', S.codeWrap ? 'soft' : 'off');
		if (state.m && !state.ed.edited) setEditor(collapse(state.code || CG.generate(state.m, opts())));
		else if (!state.m && !state.ed.scratch) { state.ed.scratch = true; setEditor(loadScratch()); }
		else paintEditor();
		$('fileName').textContent = fileName();
		$('codeNote').classList.toggle('hidden', !(state.m && state.ed.edited));
		// opções de geração: sem captura não existem; com o código editado à mão, não valem mais
		$('optsBox').classList.toggle('hidden', !state.m);
		$('optsBox').classList.toggle('dim', !!(state.m && state.ed.edited));
		$('packBtn').disabled = !state.m;
		updateRun();
	}

	// rótulo e estado do botão principal quando o código é livre (sem captura ou editado)
	function updateRun() {
		var b = $('runBtn');
		if (b.classList.contains('working') || b.classList.contains('done')) return;
		if (!state.m) {
			$('runTxt').textContent = T('executar script');
			b.disabled = !editorText().trim();
		} else if (state.ed.edited) {
			$('runTxt').textContent = T('executar código editado');
			b.disabled = !editorText().trim();
		}
	}

	// "(linha 230)" do ExtendScript conta as auxiliares, que no editor são uma linha só
	function mapError(msg, info) {
		var line = 0;
		var out = String(msg).replace(/\(linha (\d+)\)/, function (all, n) {
			n = +n;
			if (!info.at || n < info.at) { line = n; return T('(linha {0})', n); }
			if (n <= info.at + info.extra) return T('(nas funções auxiliares do BIN)');
			line = n - info.extra;
			return T('(linha {0})', line);
		});
		return { msg: out, line: line };
	}

	function selectLine(n) {
		var t = $('codeEdit'), lines = editorText().split('\n');
		if (!n || n > lines.length) return;
		var start = 0;
		for (var i = 0; i < n - 1; i++) start += lines[i].length + 1;
		showTab('code');
		t.focus();
		t.setSelectionRange(start, start + lines[n - 1].length);
		var lh = parseFloat(global.getComputedStyle(t).lineHeight) || 17.6;
		t.scrollTop = Math.max(0, (n - 4) * lh);
		syncScroll();
	}

	function fileName() {
		var m = state.m;
		if (state.ed.file && freeMode()) return state.ed.file.replace(/\.(js|jsxinc|txt)$/i, '') + (/\.jsx$/i.test(state.ed.file) ? '' : '.jsx');
		if (!m) return 'script.jsx';
		if (m.mode === 'comp') return T('criar_comp_') + CG.snake(m.rootComp.name) + '.jsx';
		var L = CG.layersIn(m.rootComp, state.ex);
		return T('criar_') + CG.snake(L.length === 1 ? L[0].name : m.rootComp.name) + '.jsx';
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
				if (!BIN.fs.writeText(p, text)) throw new Error(T('não foi possível gravar o arquivo.'));
				return p;
			}
			// sem o diálogo do CEP (versões antigas): o After Effects salva
			if (!BIN.isCEP || (global.cep && global.cep.fs && global.cep.fs.showSaveDialogEx)) return null;
			return BIN.callHostJSON('bin_saveText', [text, name]).then(function (r) { return r.path || null; });
		}).then(function (p) {
			if (p) UI.toast(T('salvo em <b>{0}</b>.', esc(BIN.fs.basename(p))), 'ok');
			return p;
		}).catch(function (e) { UI.toast(esc(BIN.tr(e.message)), 'error'); });
	}

	// pacote para o app de documentação de templates (docs-app): captura original, script gerado e,
	// se a comp for um template do padeiro, o _config.json, o preview e as fontes da pasta do template
	function bytesToBase64(bytes) {
		var s = '', chunk = 0x8000;
		for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
		return btoa(s);
	}

	function exportPack() {
		BIN.callHostJSON('bin_templateInfo').catch(function () { return {}; }).then(function (info) {
			var template = null;
			if (info && info.project) {
				template = { project: info.project, configPath: info.configPath, script: info.script, fonts: info.fonts || [] };
				try { template.config = info.config ? JSON.parse(info.config) : null; } catch (e) { template.config = null; template.configError = String(e.message || e); }
				if (info.preview) {
					try { template.preview = 'data:image/png;base64,' + bytesToBase64(BIN.fs.readBinary(info.preview)); } catch (e) { }
				}
			}
			var pack = {
				format: 'bin-doc-pack',
				version: 1,
				created: new Date().toISOString(),
				ae: state.m.ae,
				capture: state.raw,
				template: template,
				code: CG.generate(state.m, { wrap: true, comments: true, parent: true, keys: true, expr: true, target: 'new' })
			};
			var name = CG.snake(state.m.rootComp.name) + '_doc.json';
			return saveText(JSON.stringify(pack), name).then(function (p) {
				if (p && template && !template.config) UI.toast(T('pacote salvo, mas sem _config.json: a comp não parece ser um template do padeiro.'), 'warn');
			});
		});
	}

	function copyText(text, what) {
		BIN.copy(text).then(function (ok) {
			UI.toast(ok ? T('{0} copiado.', T(what)) : T('não foi possível copiar: selecione o texto e use Ctrl/Cmd+C.'), ok ? 'ok' : 'warn', { life: 1600 });
		});
	}

	// -------------------------------------------------------- recriar ------
	function resetRun() {
		var b = $('runBtn');
		clearTimeout(resetRun.t);
		if (!b.classList.contains('done') && !b.classList.contains('working')) return;
		b.classList.remove('done', 'working');
		b.querySelector('.ico').outerHTML = UI.icon('play');
	}

	// o resultado diz o que foi criado (o código pode ter vindo do editor, sem captura)
	function isCompResult(r) { return (r.comps || []).length > 0; }

	function runMessage(r) {
		var errs = r.errors || [];
		var msg;
		if (isCompResult(r)) {
			var pre = (r.comps || []).length - 1;
			msg = pre > 0 ? T('comp <b>{0}</b> criada com {1} e {2}.', esc(r.comp), plural(r.count || 0, 'layer', 'layers'), plural(pre, 'precomp', 'precomps')) : T('comp <b>{0}</b> criada com {1}.', esc(r.comp), plural(r.count || 0, 'layer', 'layers'));
		} else {
			var names = r.layers || [];
			var what = names.length === 1 ? T('<b>{0}</b> criada', esc(names[0])) : T('<b>{0}</b> layers criadas', names.length);
			msg = r.comp ? T('{0} em “{1}”.', what, esc(r.comp)) : what + '.';
		}
		if (errs.length) msg += ' ' + plural(errs.length, 'propriedade não pôde ser aplicada:', 'propriedades não puderam ser aplicadas:');
		return msg;
	}

	function run() {
		var b = $('runBtn');
		if (b.classList.contains('working')) return;
		if (b.classList.contains('done')) { resetRun(); return; }
		var free = freeMode();
		var info = codeToRun();
		var code = info.code;
		if (!code.trim()) return;
		UI.hideToast();
		b.classList.add('working');
		$('runTxt').textContent = T(free ? 'executando…' : 'recriando…');
		var after = function () { resetRun(); if (state.m) renderSummary(); else updateRun(); };

		var tmp = BIN.fs.tmpFile('bin_run.jsx');
		var p = tmp && BIN.fs.writeText(tmp, code) ? BIN.callHostJSON('bin_runFile', [tmp]) : BIN.callHostJSON('bin_run', [code]);

		p.then(function (r) {
			b.classList.remove('working');
			b.classList.add('done');
			markSeen(false); // o script seleciona o que criou: não é motivo para avisar
			b.querySelector('.ico').outerHTML = UI.icon('check');
			var errs = r.errors || [];
			if (free && !(r.layers || r.comps)) $('runTxt').textContent = T('script executado');
			else $('runTxt').textContent = isCompResult(r) ? T('comp criada') : ((r.layers || []).length > 1 ? T('{0} layers criadas', r.layers.length) : T('layer criada'));
			var msg = free && !(r.layers || r.comps) ? T('script executado.') : runMessage(r);
			UI.toast(msg, errs.length ? 'warn' : 'ok', {
				sticky: true,
				details: errs,
				actions: [
					{ label: T('desfazer'), icon: 'undo', run: function () { BIN.callHostJSON('bin_undo').then(function () { UI.toast(T('desfeito.'), 'info', { life: 1400 }); after(); }); } },
					{ label: T('exportar .jsx'), icon: 'save', run: function () { saveText(code, fileName()); } }
				]
			});
			resetRun.t = setTimeout(after, 4000);
		}).catch(function (e) {
			b.classList.remove('working');
			after();
			var err = mapError(e.message, info);
			UI.toast(esc(BIN.tr(err.msg)), 'error', {
				sticky: true,
				actions: err.line && free ? [{ label: T('ir para a linha {0}', err.line), icon: 'code', run: function () { selectLine(err.line); } }] : []
			});
		});
	}

	// ------------------------------------------------- abrir script ------
	var SCRIPT_TYPES = ['jsx', 'js', 'jsxinc', 'txt'];
	var SCRIPT_RE = /\.(jsx|js|jsxinc|txt)$/i;
	var MAX_SCRIPT = 2 * 1024 * 1024;

	// UTF-8 quando for válido; senão Windows-1252 (scripts antigos salvos sem UTF-8)
	function decodeText(bytes) {
		try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
		catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
	}

	function readScript(f) {
		if (f.path) return Promise.resolve().then(function () { return { name: BIN.fs.basename(f.path), bytes: BIN.fs.readBinary(f.path) }; });
		return f.file.arrayBuffer().then(function (buf) { return { name: f.file.name, bytes: new Uint8Array(buf) }; });
	}

	// abre o primeiro script da lista no editor (com captura, vira código editado)
	function openScripts(list) {
		var name = function (f) { return f.path ? BIN.fs.basename(f.path) : f.file.name; };
		var scripts = list.filter(function (f) { return SCRIPT_RE.test(name(f)); });
		if (!scripts.length) {
			var n = list.length ? name(list[0]) : '';
			UI.toast(/\.jsxbin$/i.test(n) ? T('.jsxbin é compilado e não dá para editar: use o .jsx original.') : T('só scripts abrem no editor: .jsx, .js, .jsxinc ou .txt.') + (state.m || state.tab !== 'tools' ? ' ' + T('Para virar binário, use os utilitários.') : ''), 'warn', { life: 4200 });
			return;
		}
		readScript(scripts[0]).then(function (r) {
			if (r.bytes.length > MAX_SCRIPT) throw new Error(T('“{0}” tem mais de 2 MB: grande demais para o editor.', r.name));
			var text = decodeText(r.bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
			if (state.m) state.ed.edited = true;
			else state.ed.scratch = true;
			state.ed.file = r.name;
			resetRun();
			showTab('code');
			setEditor(text);
			if (!state.m) saveScratch();
			renderCode();
			var t = $('codeEdit');
			t.focus();
			t.setSelectionRange(0, 0);
			t.scrollTop = 0;
			syncScroll();
			UI.toast(scripts.length > 1 ? T('<b>{0}</b> aberto no editor (só o primeiro de {1} scripts).', esc(r.name), scripts.length) : T('<b>{0}</b> aberto no editor.', esc(r.name)), 'info', { life: 2600 });
		}).catch(function (e) { UI.toast(esc(BIN.tr(e.message)), 'error', { sticky: true }); });
	}

	// ----------------------------------------------------- utilitários -----
	function showOut(which, code, info) {
		state.tools[which] = code;
		var box = $(which + 'Out');
		box.classList.remove('hidden');
		box.querySelector('pre').textContent = code.length > 20000 ? code.slice(0, 20000) + '\n… (' + CG.size(code.length) + ' no total: use copiar ou exportar)' : code;
		$(which + 'Info').textContent = info;
	}

	// caminho da propriedade: um bloco por propriedade selecionada, cada caminho com seu botão de copiar
	function pathRows() {
		return [
			[T('expressão'), [['exprAbs', T('absoluto (com a comp)')], ['exprComp', T('relativo à comp')], ['exprLayer', T('relativo à layer')], ['exprMatch', T('por matchName (qualquer idioma do AE)')]]],
			[T('script (ExtendScript)'), [['jsxAbs', T('absoluto (comp pela posição no projeto)')], ['jsxLayer', T('relativo à layer')]]]
		];
	}
	function getPaths() {
		BIN.callHostJSON('bin_propertyPaths').then(function (r) {
			var raw = r.items;
			state.paths = raw.map(CG.propertyPaths);
			var copies = state.pathCopies = [];
			// uma linha: rótulo, código (quebrando entre as partes do caminho) e botão de copiar
			var row = function (label, code) {
				copies.push(code);
				return '<div class="path-row"><span class="path-lab">' + label + '</span><code>' + esc(code).replace(/([.)])/g, '$1<wbr>') + '</code>' +
					'<button class="icon-btn" data-pc="' + (copies.length - 1) + '" title="' + esc(T('copiar')) + '">' + UI.icon('copy') + '</button></div>';
			};
			var html = '';
			// duas propriedades: como chegar de uma à outra numa expressão
			var props = state.paths.map(function (p, i) { return { p: p, raw: raw[i] }; }).filter(function (x) { return x.p.isProp; });
			if (props.length === 2) {
				var A = props[0], B = props[1];
				var ab = CG.relativePath(A.raw, B.raw), ba = CG.relativePath(B.raw, A.raw);
				var how = function (rel) {
					return rel.kind === 'group' ? T('sobe {0} até “{1}”, o grupo em comum, e desce', rel.up, esc(rel.common))
						: rel.kind === 'thisLayer' ? T('as duas estão na mesma layer') : rel.kind === 'layer' ? T('outra layer da mesma comp') : T('outra comp');
				};
				html += '<div class="path-item path-link"><div class="path-crumb"><b>' + T('entre as duas propriedades') + '</b></div>' +
					'<div class="path-sec">' + T('na expressão de “{0}”, para chegar em “{1}”', esc(A.p.name), esc(B.p.name)) + '</div>' + row(how(ab), ab.expr) +
					'<div class="path-sec">' + T('na expressão de “{0}”, para chegar em “{1}”', esc(B.p.name), esc(A.p.name)) + '</div>' + row(how(ba), ba.expr) +
					'</div>';
			}
			html += state.paths.map(function (p) {
				var crumb = p.crumb.map(esc);
				crumb[crumb.length - 1] = '<b>' + crumb[crumb.length - 1] + '</b>';
				var out = '<div class="path-item"><div class="path-crumb">' + crumb.join('<span class="sep">›</span>') + '</div>' +
					pathRows().map(function (sec) {
						return '<div class="path-sec">' + sec[0] + '</div>' + sec[1].map(function (r) { return row(r[1], p[r[0]]); }).join('');
					}).join('');
				// dentro da expressão desta propriedade: o nome de cada grupo acima dela
				if (p.isProp) {
					out += '<div class="path-sec">' + T('grupos acima (o nome, numa expressão desta propriedade)') + '</div>' +
						p.ups.map(function (u) {
							return row('↑' + u.n + ' · ' + esc(u.name) + (u.layer ? ' (' + T('layer') + ')' : ''), u.layer ? 'thisLayer.name' : u.expr + '.name');
						}).join('');
				}
				return out + '</div>';
			}).join('');
			var box = $('pathOut');
			box.innerHTML = html;
			box.classList.remove('hidden');
		}).catch(function (e) { UI.toast(esc(BIN.tr(e.message)), 'error'); });
	}

	function getExpressions() {
		BIN.callHostJSON('bin_expressions').then(function (r) {
			showOut('expr', CG.expressions(r.items), plural(r.items.length, 'expressão', 'expressões'));
		}).catch(function (e) { UI.toast(esc(BIN.tr(e.message)), 'error'); });
	}

	// arquivo → binário: a string fica ~4× maior que o arquivo; acima disso o painel trava
	var MAX_BINARY = 20 * 1024 * 1024;
	function convertFiles(list) {
		var big = list.map(function (f) { return { name: f.path ? BIN.fs.basename(f.path) : f.file.name, size: f.path ? BIN.fs.size(f.path) : f.file.size }; });
		var sum = big.reduce(function (s, f) { return s + Math.max(0, f.size); }, 0);
		if (sum > MAX_BINARY) {
			UI.toast(T(list.length === 1 ? '“{0}” tem {1}: grande demais para virar string (o limite é {2}).' : 'os arquivos somam {1}: grande demais para virar string (o limite é {2}).', esc(big[0].name), CG.size(sum), CG.size(MAX_BINARY)), 'warn', { life: 4200 });
			return;
		}
		Promise.all(list.map(function (f) {
			if (f.path) return { name: BIN.fs.basename(f.path), bytes: BIN.fs.readBinary(f.path) };
			return f.file.arrayBuffer().then(function (buf) { return { name: f.file.name, bytes: new Uint8Array(buf) }; });
		})).then(function (files) {
			if (!files.length) return;
			var total = files.reduce(function (s, f) { return s + f.bytes.length; }, 0);
			state.tools.binName = (files.length === 1 ? CG.snake(files[0].name.replace(/\.[^.]+$/, '')) : T('arquivos')) + '_bin.jsxinc';
			showOut('bin', CG.binaryFiles(files), plural(files.length, 'arquivo', 'arquivos') + ' · ' + CG.size(total));
		}).catch(function (e) { UI.toast(esc(BIN.tr(e.message)), 'error'); });
	}

	// ----------------------------------------------------------- bind ------
	function bindTree() {
		$('tree').addEventListener('click', function (e) {
			// selo .ffx de um pseudo effect: salva sem abrir / fechar o grupo
			var fb = e.target.closest('[data-ffx]');
			if (fb) {
				e.stopPropagation();
				var pf = CG.pseudoEffects(state.m).filter(function (p) { return p.mn === fb.dataset.ffx; })[0];
				if (pf) savePseudo(pf);
				return;
			}
			// olho (grupos, cards, layers, comps) ou a linha inteira (propriedades)
			var hit = e.target.closest('.eye') || e.target.closest('.row.leaf');
			if (hit && hit.dataset.id) {
				var id0 = hit.dataset.id;
				var on = !excluded(id0);
				// parcial (alguns filhos fora): o clique inclui tudo
				setIncluded(id0, !on || anyExcludedBelow(id0));
				changed();
				return;
			}
			if (e.target.closest('[data-back]')) {
				state.focus = null;
				renderTree();
				$('tab-props').scrollTop = state.listScroll || 0;
				return;
			}
			var row = e.target.closest('[data-open]');
			if (row) {
				state.listScroll = $('tab-props').scrollTop;
				state.focus = row.dataset.open;
				renderTree();
				$('tab-props').scrollTop = 0;
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
		$('copyBtn').onclick = function () { var c = codeToRun().code; if (c.trim()) copyText(c, 'código'); };
		$('exportBtn').onclick = function () { var c = codeToRun().code; if (c.trim()) saveText(c, fileName()); };

		var ed = $('codeEdit');
		ed.addEventListener('input', function () {
			if (state.m) {
				if (!state.ed.edited) { state.ed.edited = true; $('codeNote').classList.remove('hidden'); }
			} else saveScratch();
			$('optsBox').classList.toggle('dim', !!(state.m && state.ed.edited));
			resetRun();
			paintEditor();
			updateRun();
		});
		ed.addEventListener('scroll', syncScroll);
		ed.addEventListener('keydown', function (e) {
			// Tab insere tabulação (Shift+Tab continua saindo do campo)
			if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				var a = ed.selectionStart, z = ed.selectionEnd;
				ed.value = ed.value.slice(0, a) + '	' + ed.value.slice(z);
				ed.selectionStart = ed.selectionEnd = a + 1;
				ed.dispatchEvent(new Event('input'));
			}
		});
		$('discardBtn').onclick = function () { state.ed.edited = false; state.ed.file = null; renderCode(); renderSummary(); };
		$('openBtn').onclick = function () {
			BIN.dialog.openFiles(T('abrir script'), SCRIPT_TYPES, true).then(function (paths) {
				if (paths && paths.length) openScripts([{ path: paths[0] }]);
			});
		};
		$('packBtn').onclick = function () { if (state.m) exportPack(); };
	}

	function bindTools() {
		$('exprBtn').onclick = getExpressions;
		$('pathBtn').onclick = getPaths;
		$('pathOut').addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('[data-pc]');
			if (!b) return;
			copyText(state.pathCopies[+b.dataset.pc], 'caminho');
		});
		var drop = $('binDrop');
		drop.onclick = function () {
			BIN.dialog.openFiles(T('escolha os arquivos')).then(function (paths) {
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
		// fora da área do binário, um script solto abre no editor (e nada abre no lugar do painel)
		var depth = 0;
		var acceptsScript = function (e) {
			var dt = e.dataTransfer;
			return dt && Array.prototype.indexOf.call(dt.types || [], 'Files') >= 0 && state.tab !== 'tools';
		};
		var hideDrop = function () { depth = 0; document.body.classList.remove('dragging'); };
		document.addEventListener('dragenter', function (e) {
			e.preventDefault();
			if (!acceptsScript(e)) return;
			depth++;
			document.body.classList.add('dragging');
		});
		document.addEventListener('dragleave', function () { if (depth && --depth === 0) hideDrop(); });
		document.addEventListener('dragover', function (e) { e.preventDefault(); });
		document.addEventListener('drop', function (e) {
			e.preventDefault();
			var ok = acceptsScript(e);
			hideDrop();
			if (!ok || (e.target.closest && e.target.closest('#binDrop'))) return;
			var files = Array.prototype.slice.call(e.dataTransfer.files || []);
			if (files.length) openScripts(files.map(function (f) { return f.path && BIN.hasFS ? { path: f.path } : { file: f }; }));
		});

		$('pseudoList').addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('button');
			if (!b || !state.pseudo) return;
			if (b.dataset.pseudoSave !== undefined) savePseudo(state.pseudo[+b.dataset.pseudoSave]);
			if (b.dataset.pseudoPick !== undefined) pickFfx(state.pseudo[+b.dataset.pseudoPick]);
		});

		each(document.querySelectorAll('[data-copy]'), function (b) {
			b.onclick = function () { copyText(state.tools[b.dataset.copy], b.dataset.copy === 'expr' ? 'expressão' : 'código'); };
		});
		each(document.querySelectorAll('[data-save]'), function (b) {
			b.onclick = function () { saveText(state.tools[b.dataset.save], b.dataset.save === 'expr' ? T('expressoes.jsxinc') : state.tools.binName); };
		});
	}

	// atalhos (o painel só recebe teclas quando está em foco)
	function bindKeys() {
		document.addEventListener('keydown', function (e) {
			var mod = e.metaKey || e.ctrlKey;
			var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
			var k = e.key;
			if (k === 'Escape') {
				if (e.target && e.target.id === 'query' && $('query').value) { $('query').value = ''; renderTree(); return; }
				if (state.focus) { state.focus = null; renderTree(); return; }
				UI.hideToast();
				return;
			}
			if (mod && (k === 'f' || k === 'F')) { e.preventDefault(); showTab('props'); $('query').focus(); $('query').select(); return; }
			if (mod && (k === 'l' || k === 'L')) { e.preventDefault(); capture(false); return; }
			if (mod && k === 'Enter') { e.preventDefault(); if (!$('runBtn').disabled) run(); return; }
			if (mod && (k === 'o' || k === 'O')) { e.preventDefault(); $('openBtn').click(); return; }
			if (mod && (k === 's' || k === 'S')) { e.preventDefault(); $('exportBtn').click(); return; }
			if (mod && e.shiftKey && (k === 'c' || k === 'C')) { e.preventDefault(); $('copyBtn').click(); return; }
			if (!mod && !typing && /^[123]$/.test(k)) showTab(TABS[+k - 1]);
		});
	}

	// ----------------------------------------------------------- idioma ----
	var I18N = BIN.i18n;
	var LANG_NEXT = { pt: 'en', en: 'es', es: 'pt' };
	function applyLang() {
		I18N.set(S.lang || 'pt');
		I18N.dom(document.body);
		$('langTxt').textContent = I18N.lang.toUpperCase();
		UI.setTip($('langBtn'), T('idioma: {0}', I18N.NAMES[I18N.lang]) + '\n' + T('clique para trocar') + '\n' + T('os textos ficam em i18n/textos.csv'));
		applyTheme(false);
		state.code = null;
		if (state.m) render();
		else renderPseudo();
		renderCode();
		renderSelection();
		setTimeout(placeTabInk, 0);
		UI.opticalCenter();
	}

	function bind() {
		$('logo').innerHTML = UI.logo;
		// idioma: o escolhido no painel ou, na primeira vez, o do After Effects
		I18N.init();
		I18N.set(S.lang || 'pt');
		I18N.dom(document.body);
		$('langTxt').textContent = I18N.lang.toUpperCase();
		$('langBtn').onclick = function () { S.lang = LANG_NEXT[I18N.lang] || 'pt'; saveSettings(); applyLang(); };
		UI.hydrateIcons();
		UI.tooltips();
		UI.opticalCenter();
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(UI.opticalCenter);

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
		setInterval(pollSelection, 1000);
		// sombra sob as abas quando o conteúdo da aba está rolado
		var shade = function () {
			var p = document.querySelector('.panel.active');
			document.querySelector('main').classList.toggle('scrolled', !!p && p.scrollTop > 2);
		};
		each(document.querySelectorAll('.panel'), function (p) { p.addEventListener('scroll', shade, { passive: true }); });
		document.querySelector('.tabs').addEventListener('click', function () { setTimeout(shade, 0); });
		document.addEventListener('visibilitychange', function () { if (!document.hidden) pollSelection(); });
		$('captureBtn').onclick = function () { setMode('layers'); capture(false); };
		$('captureCompBtn').onclick = function () { setMode('comp'); capture(false); };
		$('scriptBtn').onclick = function () { showTab('code'); $('codeEdit').focus(); };
		$('runBtn').onclick = run;
		$('warnPill').onclick = function () {
			UI.toast(T('{0} sobre o script gerado:', plural(state.warnings.length, 'aviso', 'avisos')), 'warn', { sticky: true, details: state.warnings });
		};

		bindTree();
		bindKeys();
		BIN.claimKeys();
		bindOptions();
		bindCode();
		bindTools();
		renderCode();
		if (S.tab && S.tab !== 'props' && TABS.indexOf(S.tab) >= 0) showTab(S.tab);
		// host sempre na mesma versão do painel; a assinatura dos arquivos aparece no logo
		var stamp = BIN.localStamp();
		UI.setTip($('logo'), (stamp ? T('{0} · versão {1}', CG.NAME, stamp) : CG.NAME) + '\n' + T('engenharia reversa de layers'));
		BIN.reloadHost().then(function () {
			if (S.lang) return null;
			return BIN.callHostJSON('bin_lang').then(function (r) { S.lang = I18N.pick(r.iso); saveSettings(); if (S.lang !== I18N.lang) applyLang(); }, function () { });
		}).then(function () {
			return capture(true);
		}).then(function () { if (!state.m) pollSelection(); });
	}

	BIN.app = { capture: capture, showTab: showTab, state: state, mapError: mapError, collapse: collapse, expand: expand, opts: opts,
		// testes: esquece os .ffx guardados e as propostas desta sessão
		forgetFfx: function () { S.ffx = {}; ffxCache = {}; ffxAsked = {}; saveSettings(); } };

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
	else bind();
})(window);
