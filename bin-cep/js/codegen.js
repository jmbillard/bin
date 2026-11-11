/*
 * BIN - gerador de código
 *
 * Transforma a captura (JSON vindo do host.jsx) em um script .jsx autônomo que
 * recria as layers (ou a comp inteira, com as precomps) em qualquer projeto.
 * Não depende do DOM: roda no painel e no Node (testes).
 *
 * Modelo (CG.prepare):
 *   { mode: 'layers' | 'comp', comps: [comp], root: id }
 *   comp  = { key, id, name, width, height, pixelAspect, duration, frameRate, settings, markers, layers, root }
 *   layer = { id, index, name, type, attrs, groups, markers, source, parent, matte, warnings }
 *   nó    = { id, k: 'g' | 'p', mn, name, idx, kids | v | keys, x, ... }
 *
 * Todos os nós têm um id estável; `opts.excluded[id]` tira o nó (e o que estiver
 * dentro dele) do script.
 */
(function (root) {
	'use strict';

	// tradução (i18n/textos.csv): no painel vem de BIN.i18n; no Node (testes), do próprio i18n.js
	var I18N = (typeof window !== 'undefined' && window.BIN && window.BIN.i18n) || null;
	if (!I18N && typeof require === 'function' && typeof window === 'undefined') {
		try { I18N = require('./i18n.js'); } catch (e) { I18N = null; }
	}
	function T(s) {
		var a = arguments;
		if (I18N) return I18N.t.apply(null, a);
		return String(s).replace(/\{(\d)\}/g, function (m, n) { return a[+n + 1]; });
	}

	var CG = {};
	var I = '\t';

	// ============================================================ literais ==
	function num(n) {
		if (typeof n !== 'number' || !isFinite(n)) return '0';
		var r = Math.round(n * 10000) / 10000;
		return String(r === 0 ? 0 : r); // sem -0
	}

	// string JS entre aspas simples, só ASCII (o .jsx abre certo em qualquer codificação)
	function str(s) {
		s = String(s);
		var out = "'";
		for (var i = 0; i < s.length; i++) {
			var c = s.charAt(i), code = s.charCodeAt(i);
			if (c === "'") out += "\\'";
			else if (c === '\\') out += '\\\\';
			else if (c === '\n') out += '\\n';
			else if (c === '\r') out += '\\r';
			else if (c === '\t') out += '\\t';
			else if (code < 32 || code > 126) out += '\\u' + ('000' + code.toString(16)).slice(-4);
			else out += c;
		}
		return out + "'";
	}

	var IDENT = /^[A-Za-z_$][\w$]*$/;
	var RESERVED = ('break case catch class const continue debugger default delete do else enum export extends false finally for ' +
		'function if import in instanceof new null return super switch this throw true try typeof var void while with yield ' +
		'let static implements interface package private protected public undefined arguments eval ' +
		'app bin comp layer C L').split(' ');

	function key(k) { return IDENT.test(k) && RESERVED.indexOf(k) < 0 ? k : str(k); }

	function lit(v) {
		if (v === null || v === undefined) return 'null';
		var t = typeof v;
		if (t === 'number') return num(v);
		if (t === 'boolean') return v ? 'true' : 'false';
		if (t === 'string') return str(v);
		if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
		if (v.e && /^[A-Za-z]+\.[A-Z_]+$/.test(v.e)) return v.e;
		if (v.shape) return 'bin.shape(' + obj(v.shape) + ')';
		if (v.doc) return 'bin.doc(' + obj(v.doc) + ')';
		return obj(v);
	}

	function obj(o) {
		var parts = Object.keys(o).filter(function (k) { return o[k] !== undefined; }).map(function (k) { return key(k) + ': ' + lit(o[k]); });
		return '{ ' + parts.join(', ') + ' }';
	}

	// objeto em uma linha ou, se for longo, uma chave por linha
	function block(list, ind) {
		if (list.length <= 2) return '{ ' + list.map(function (a) { return key(a.key) + ': ' + lit(a.v); }).join(', ') + ' }';
		return '{\n' + list.map(function (a) { return ind + I + key(a.key) + ': ' + lit(a.v); }).join(',\n') + '\n' + ind + '}';
	}

	// texto seguro dentro de comentários
	function plain(s) { return String(s).replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /'); }

	CG.num = num;
	CG.str = str;
	CG.lit = lit;

	// =============================================================== nomes ==
	function ascii(s) {
		s = String(s || '');
		return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
	}

	function slug(s) {
		var words = ascii(s).replace(/[^\w]+/g, ' ').trim().split(/\s+/).filter(Boolean);
		var out = words.map(function (w, i) {
			w = w.toLowerCase();
			return i ? w.charAt(0).toUpperCase() + w.slice(1) : w;
		}).join('');
		return /^\d/.test(out) ? 'n' + out : out;
	}

	function snake(s) {
		s = ascii(s).replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
		return (/^\d/.test(s) ? 'n' + s : s) || 'layer';
	}

	CG.slug = slug;
	CG.snake = snake;

	function Namer(parent) { this.used = Object.create(parent ? parent.used : null); }
	Namer.prototype.take = function (base, fallback, raw) {
		var b = (raw ? base : slug(base)) || fallback || 'grp';
		if (RESERVED.indexOf(b) >= 0) b += '_';
		var n = b, i = 2;
		while (this.used[n]) n = b + (i++);
		this.used[n] = true;
		return n;
	};

	// ============================================================== modelo ==
	CG.prepare = function (raw) {
		var m = { mode: raw.mode === 'comp' ? 'comp' : 'layers', ae: raw.ae };
		if (m.mode === 'comp') {
			m.comps = raw.comps;
			m.root = raw.root;
		} else {
			var c = raw.comp;
			c.layers = raw.layers;
			m.comps = [c];
			m.root = c.id;
		}
		m.comps.forEach(function (C, ci) {
			C.key = 'C' + ci;
			C.root = C.id === m.root;
			C.settings = C.settings || {};
			C.markers = C.markers || [];
			C.settingsId = C.key + '/comp';
			C.markersId = C.key + '/markers';
			C.warnings = C.warnings || [];
			C.egp = C.egp || [];
			C.egpId = C.key + '/egp';
			C.egp.forEach(function (e, i) { e.id = C.egpId + '/' + i; });
			C.layers.forEach(function (L, li) {
				L.id = C.key + '/L' + li;
				L.attrsId = L.id + '/attrs';
				L.markersId = L.id + '/markers';
				L.markers = L.markers || [];
				L.warnings = L.warnings || [];
				L.overrides = L.overrides || [];
				L.overridesId = L.id + '/overrides';
				L.overrides.forEach(function (o, i) { o.id = L.overridesId + '/' + i; });
				(function walk(nodes, pid) {
					var seen = {};
					nodes.forEach(function (n) { seen[n.mn] = (seen[n.mn] || 0) + 1; });
					nodes.forEach(function (n) {
						n.id = pid + '/' + n.idx;
						if (seen[n.mn] > 1) n.dup = true; // matchName repetido no mesmo grupo: acessa pelo índice
						if (n.kids) walk(n.kids, n.id);
					});
				})(L.groups, L.id);
			});
		});
		m.rootComp = m.comps.filter(function (C) { return C.root; })[0];
		return m;
	};

	// comps que entram no script: a principal e as precomps marcadas que ela ainda usa
	// (desmarcar uma precomp tira também as que só ela usava)
	CG.compsIn = function (m, ex) {
		ex = ex || {};
		if (m.mode === 'layers') return m.comps;
		var byId = {}, keep = {};
		m.comps.forEach(function (C) { byId[C.id] = C; });
		(function visit(C) {
			if (keep[C.id]) return;
			keep[C.id] = true;
			CG.layersIn(C, ex).forEach(function (L) {
				var src = L.source;
				if (L.type === 'precomp' && src && byId[src.id] && !ex[byId[src.id].key]) visit(byId[src.id]);
			});
		})(m.rootComp || m.comps.filter(function (C) { return C.root; })[0]);
		return m.comps.filter(function (C) { return keep[C.id]; });
	};

	CG.layersIn = function (C, ex) {
		ex = ex || {};
		return C.layers.filter(function (L) { return !ex[L.id]; });
	};

	// ---------------------------------------------------------- atributos --
	var ATTR_DEFAULTS = {
		comment: '', enabled: true, shy: false, locked: false, stretch: 100, startTime: 0,
		threeDLayer: false, motionBlur: false, adjustmentLayer: false, guideLayer: false, collapseTransformation: false,
		effectsActive: true, preserveTransparency: false, timeRemapEnabled: false, audioEnabled: true, threeDPerChar: false,
		blendingMode: 'BlendingMode.NORMAL', quality: 'LayerQuality.BEST', samplingQuality: 'LayerSamplingQuality.BILINEAR',
		frameBlendingType: 'FrameBlendingType.NO_FRAME_BLEND', autoOrient: 'AutoOrientType.NO_AUTO_ORIENT'
	};
	// a ordem importa: early antes das propriedades (time remap, 3D), late depois (entrada / saída)
	var ATTR_EARLY = ['name', 'label', 'comment', 'threeDLayer', 'threeDPerChar', 'timeRemapEnabled', 'stretch', 'startTime'];
	var ATTR_LATE = ['inPoint', 'outPoint', 'enabled', 'shy', 'motionBlur', 'adjustmentLayer', 'guideLayer', 'collapseTransformation',
		'effectsActive', 'preserveTransparency', 'audioEnabled', 'blendingMode', 'quality', 'samplingQuality', 'frameBlendingType', 'autoOrient', 'locked'];

	function same(a, b) {
		if (a && a.e) a = a.e;
		if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return Math.abs(x - b[i]) < 1e-6; });
		if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
		return a === b;
	}

	CG.attrList = function (L) {
		var out = [];
		ATTR_EARLY.concat(ATTR_LATE).forEach(function (k) {
			if (!(k in L.attrs)) return;
			var v = L.attrs[k];
			if (k === 'autoOrient' && L.type === 'camera' && same(v, 'AutoOrientType.CAMERA_OR_POINT_OF_INTEREST')) return;
			if (k in ATTR_DEFAULTS && same(v, ATTR_DEFAULTS[k])) return;
			out.push({ key: k, v: v, late: ATTR_LATE.indexOf(k) >= 0 });
		});
		return out;
	};

	// configurações da comp diferentes do padrão de uma comp nova (duração antes do início da work area)
	var COMP_ORDER = ['bgColor', 'displayStartTime', 'workAreaDuration', 'workAreaStart', 'motionBlur', 'frameBlending', 'hideShyLayers', 'draft3d',
		'shutterAngle', 'shutterPhase', 'motionBlurSamplesPerFrame', 'motionBlurAdaptiveSampleLimit', 'preserveNestedFrameRate',
		'preserveNestedResolution', 'resolutionFactor', 'renderer', 'comment', 'label'];
	var COMP_DEFAULTS = {
		bgColor: [0, 0, 0], displayStartTime: 0, workAreaStart: 0, motionBlur: false, frameBlending: false, hideShyLayers: false, draft3d: false,
		shutterAngle: 180, shutterPhase: -90, motionBlurSamplesPerFrame: 16, motionBlurAdaptiveSampleLimit: 128, preserveNestedFrameRate: false,
		preserveNestedResolution: false, resolutionFactor: [1, 1], renderer: 'ADBE Advanced 3d', comment: ''
	};

	CG.compAttrList = function (C) {
		return COMP_ORDER.filter(function (k) {
			if (!(k in C.settings)) return false;
			var def = k === 'workAreaDuration' ? C.duration : COMP_DEFAULTS[k];
			return def === undefined || !same(C.settings[k], def);
		}).map(function (k) { return { key: k, v: C.settings[k] }; });
	};

	// ------------------------------------------------------------ contagem --
	CG.stats = function (m, opt) {
		var ex = (opt && opt.excluded) || {};
		var s = { comps: 0, layers: 0, props: 0, keys: 0, expr: 0, fx: 0 };
		CG.compsIn(m, ex).forEach(function (C) {
			s.comps++;
			CG.layersIn(C, ex).forEach(function (L) {
				s.layers++;
				(function walk(nodes) {
					nodes.forEach(function (n) {
						if (ex[n.id]) return;
						if (n.k === 'g') {
							if (n.fx) s.fx++;
							walk(n.kids);
							return;
						}
						s.props++;
						if (n.keys) s.keys += n.keys.length;
						if (n.x) s.expr++;
					});
				})(L.groups);
				if (!ex[L.overridesId]) (L.overrides || []).forEach(function (o) {
					if (ex[o.id]) return;
					s.props++;
					if (o.x) s.expr++;
				});
			});
		});
		return s;
	};

	// ====================================================== pseudo effects ==
	// pseudo effects da captura (um por matchName) e onde cada um está: comp, layer e posição na pilha de efeitos
	// (o painel usa para salvar o .ffx pelo próprio After Effects)
	CG.pseudoEffects = function (m) {
		var seen = {}, list = [];
		(m.comps || []).forEach(function (C) {
			C.layers.forEach(function (L) {
				(function walk(nodes) {
					(nodes || []).forEach(function (n) {
						if (n.pseudo) {
							if (!seen[n.mn]) { seen[n.mn] = { mn: n.mn, name: n.name, at: [] }; list.push(seen[n.mn]); }
							seen[n.mn].at.push({ comp: C.id, layer: L.index, layerName: L.name, fx: n.idx, id: n.id });
						}
						if (n.kids) walk(n.kids);
					});
				})(L.groups);
			});
		});
		return list;
	};

	// .ffx que entram no script: só os dos pseudo effects que o script cria
	function ffxUsed(g) {
		var ffx = g.o.ffx || {}, used = {}, any = false;
		g.comps.forEach(function (C) {
			CG.layersIn(C, g.ex).forEach(function (L) {
				(function walk(nodes) {
					(nodes || []).forEach(function (n) {
						if (g.ex[n.id]) return;
						if (n.pseudo && ffx[n.mn] && !used[n.mn]) { used[n.mn] = ffx[n.mn]; any = true; }
						if (n.kids) walk(n.kids);
					});
				})(L.groups);
			});
		});
		return any ? used : null;
	}

	// ============================================================= geração ==
	var DEFAULT_OPTS = { target: 'active', wrap: true, parent: true, comments: true, keys: true, expr: true, excluded: {}, now: null, ffx: null };

	var SECTION = /^(ADBE Transform Group|ADBE Root Vectors Group|ADBE Effect Parade|ADBE Mask Parade|ADBE Text Properties|ADBE Camera Options Group|ADBE Light Options Group|ADBE Material Options Group|ADBE Audio Group)$/;
	var ITEM = /^(ADBE Vector Group|ADBE Mask Atom|ADBE Text Animator)$/;

	function Gen(m, opts) {
		var o = this.o = {};
		Object.keys(DEFAULT_OPTS).forEach(function (k) { o[k] = opts && opts[k] !== undefined ? opts[k] : DEFAULT_OPTS[k]; });
		this.m = m;
		this.ex = o.excluded || {};
		this.comps = CG.compsIn(m, this.ex);
		this.compById = {};
		var self = this;
		if (m.mode === 'comp') this.comps.forEach(function (C) { self.compById[C.id] = C; });
		this.top = new Namer();
	}

	Gen.prototype.comment = function (out, ind, text) {
		if (this.o.comments) out.push(ind + '// ' + plain(text));
	};

	// --------------------------------------------------------------- layer --
	Gen.prototype.textDoc = function (L) {
		var tp = L.groups.filter(function (g) { return g.mn === 'ADBE Text Properties'; })[0];
		var td = tp && tp.kids.filter(function (k) { return k.mn === 'ADBE Text Document'; })[0];
		var v = td && (td.v || (td.keys && td.keys[0].v));
		return v && v.doc;
	};

	Gen.prototype.make = function (L) {
		var src = L.source || {};
		switch (L.type) {
			case 'shape': return 'comp.layers.addShape()';
			case 'text': {
				var doc = this.textDoc(L);
				return doc && doc.boxText && doc.boxTextSize ? 'comp.layers.addBoxText(' + lit(doc.boxTextSize) + ')' : 'comp.layers.addText()';
			}
			case 'null': return 'comp.layers.addNull()';
			case 'solid':
			case 'adjustment':
				return 'comp.layers.addSolid(' + [lit(src.color), str(src.name), num(src.width), num(src.height), num(src.pixelAspect || 1)].join(', ') + ')';
			case 'camera': return 'comp.layers.addCamera(' + str(L.name) + ', [comp.width / 2, comp.height / 2])';
			case 'light': return 'comp.layers.addLight(' + str(L.name) + ', [comp.width / 2, comp.height / 2])';
		}
		// precomp recriada pelo próprio script
		if (src.kind === 'comp' && this.compById[src.id]) return 'comp.layers.add(C[' + src.id + '])';
		return 'bin.source(comp, ' + obj({ name: src.name, kind: src.kind, file: src.file, width: src.width, height: src.height, duration: src.duration }) + ')';
	};

	Gen.prototype.layer = function (L, lv, namer, ind, out) {
		var ex = this.ex, o = this.o, self = this;
		out.push(ind + 'var ' + lv + ' = ' + this.make(L) + ';');
		if (L.type === 'adjustment') out.push(ind + lv + '.adjustmentLayer = true;');
		if (L.type === 'light' && L.source && L.source.lightType) out.push(ind + 'bin.attrs(' + lv + ', { lightType: ' + lit(L.source.lightType) + ' });');

		var attrs = ex[L.attrsId] ? [] : CG.attrList(L).filter(function (a) { return a.key !== 'locked' && !ex[L.attrsId + '/' + a.key]; });
		var early = attrs.filter(function (a) { return !a.late; });
		var late = attrs.filter(function (a) { return a.late; });
		if (early.length) out.push(ind + 'bin.attrs(' + lv + ', ' + block(early, ind) + ');');

		L.groups.forEach(function (n) { self.node(n, lv, namer, ind, out); });

		var ov = ex[L.overridesId] ? [] : L.overrides.filter(function (o) { return !ex[o.id]; });
		if (ov.length) {
			out.push('');
			this.comment(out, ind, T('essential properties (valores mudados nesta layer)'));
			out.push(ind + 'bin.over(' + lv + ', [');
			ov.forEach(function (o, i) {
				var parts = ['n: ' + lit(o.names)];
				if (o.v !== undefined) parts.push('v: ' + lit(o.v));
				if (o.x && self.o.expr) parts.push('x: ' + str(o.x) + (o.xoff ? ', on: false' : ''));
				out.push(ind + I + '{ ' + parts.join(', ') + ' }' + (i < ov.length - 1 ? ',' : ''));
			});
			out.push(ind + ']);');
		}

		if (L.markers.length && !ex[L.markersId]) {
			out.push('');
			this.comment(out, ind, 'markers');
			this.markers(L.markers, L.markersId, lv, ind, out);
		}
		if (late.length) {
			out.push('');
			out.push(ind + 'bin.attrs(' + lv + ', ' + block(late, ind) + ');');
		}
	};

	Gen.prototype.markers = function (list, pid, target, ind, out) {
		var ex = this.ex;
		list.forEach(function (m, i) {
			if (ex[pid + '/' + i]) return;
			var mo = {};
			Object.keys(m).forEach(function (k) { if (k !== 't') mo[k] = m[k]; });
			out.push(ind + 'bin.marker(' + target + ', ' + num(m.t) + ', ' + obj(mo) + ');');
		});
	};

	Gen.prototype.hasContent = function (n) {
		if (this.ex[n.id]) return false;
		if (n.k !== 'g' || n.add) return true;
		return n.kids.some(this.hasContent, this);
	};

	function access(n, pv) {
		return pv + '.property(' + (n.dup ? n.idx : str(n.mn)) + ')';
	}

	Gen.prototype.node = function (n, pv, namer, ind, out) {
		if (!this.hasContent(n)) return;
		var o = this.o, self = this;

		if (n.k === 'g') {
			var v = namer.take(n.name, 'grp');
			if (n.fx || (n.add && ITEM.test(n.mn))) {
				out.push('');
				this.comment(out, ind, n.fx ? T('efeito › {0}', n.name) : n.name);
			} else if (!n.add && SECTION.test(n.mn)) {
				out.push('');
				this.comment(out, ind, n.name.toLowerCase());
			}
			var mk = n.pseudo && this.ffx && this.ffx[n.mn] ? 'bin.pseudo(' + pv + ', ' + str(n.mn) + ', ' + str(n.name) + ', FFX[' + str(n.mn) + '])' : 'bin.add(' + pv + ', ' + str(n.mn) + ', ' + str(n.name) + ')';
			out.push(ind + 'var ' + v + ' = ' + (n.add ? mk : access(n, pv)) + ';');
			if (n.off) out.push(ind + v + '.enabled = false;');
			if (n.mask) {
				var m = n.mask, mo = {};
				if (m.mode && m.mode.e !== 'MaskMode.ADD') mo.maskMode = m.mode;
				if (m.inverted) mo.inverted = true;
				if (m.rotoBezier) mo.rotoBezier = true;
				if (m.motionBlur && m.motionBlur.e && m.motionBlur.e !== 'MaskMotionBlur.SAME_AS_LAYER') mo.maskMotionBlur = m.motionBlur;
				if (m.falloff && m.falloff.e && m.falloff.e !== 'MaskFeatherFalloff.FFO_SMOOTH') mo.maskFeatherFalloff = m.falloff;
				if (m.color) mo.color = m.color;
				if (m.locked) mo.locked = true;
				if (Object.keys(mo).length) out.push(ind + 'bin.attrs(' + v + ', ' + obj(mo) + ');');
			}
			n.kids.forEach(function (k) { self.node(k, v, namer, ind, out); });
			return;
		}

		// propriedade
		if (n.sep) {
			out.push(ind + access(n, pv) + '.dimensionsSeparated = true;');
			return;
		}
		var target = n.add ? 'bin.add(' + pv + ', ' + str(n.mn) + ')' : access(n, pv);
		var useKeys = n.keys && o.keys;
		var value = n.keys ? n.keys[0].v : n.v;
		var ops = [];
		if (useKeys) ops.push('keys');
		else if (value !== undefined) ops.push('set');
		if (n.x && o.expr) ops.push('expr');
		if (!ops.length) {
			if (n.add) out.push(ind + target + ';');
			return;
		}
		var t = target;
		if (ops.length > 1 || n.add) {
			t = namer.take(n.name, 'prop');
			out.push(ind + 'var ' + t + ' = ' + target + ';');
		}
		ops.forEach(function (op) {
			if (op === 'set' && n.lyr) out.push(ind + 'bin.ref(' + t + ', ' + obj({ name: n.lyr.name, index: n.lyr.index }) + ');' + (o.comments ? ' // ' + T('aponta para a layer quando todas existirem') : ''));
			else if (op === 'set') out.push(ind + 'bin.set(' + t + ', ' + lit(value) + ');');
			if (op === 'keys') {
				out.push(ind + 'bin.keys(' + t + ', [');
				n.keys.forEach(function (k, i) { out.push(ind + I + keyLit(k) + (i < n.keys.length - 1 ? ',' : '')); });
				out.push(ind + ']);');
			}
			if (op === 'expr') {
				var xl = String(n.x).split(/\r\n|\r|\n/);
				var xs = xl.length > 1
					? '[\n' + xl.map(function (l) { return ind + I + str(l); }).join(',\n') + '\n' + ind + "].join('\\n')"
					: str(n.x);
				out.push(ind + 'bin.expr(' + t + ', ' + xs + (n.xoff ? ', false' : '') + ');');
			}
		});
	};

	function keyLit(k) {
		var ko = { t: k.t, v: k.v };
		var clamp = function (e) { return [e[0], Math.max(0.1, Math.min(100, e[1]))]; };
		var zero = function (a) { return !a || a.every(function (x) { return x === 0; }); };
		if (k.i) ko.i = k.i;
		if (k.ei && /B/.test(k.i || 'B') && !k.ta) { ko.ei = k.ei.map(clamp); ko.eo = k.eo.map(clamp); }
		['tc', 'ta', 'sc', 'sa', 'rv'].forEach(function (f) { if (k[f]) ko[f] = true; });
		if (k.si && !k.sa && !(zero(k.si) && zero(k.so))) { ko.si = k.si; ko.so = k.so; }
		return obj(ko);
	}

	// ---------------------------------------------------------- uma comp ----
	// corpo de criação das layers de uma comp: chamadas (ou blocos), parentesco, track matte e travas
	Gen.prototype.compBody = function (C, plans, ind, out) {
		var ex = this.ex, o = this.o, self = this;
		var ordered = plans.slice().sort(function (a, b) { return b.L.index - a.L.index; }); // de baixo para cima
		ordered.forEach(function (p) {
			var ref = 'L[' + p.L.index + ']';
			if (o.wrap) {
				out.push(ind + ref + ' = ' + p.fn + '(comp);');
			} else {
				out.push('');
				self.comment(out, ind, '---- ' + p.L.name + ' (' + p.L.type + ')');
				p.body.forEach(function (l) { out.push(l); });
				out.push(ind + ref + ' = ' + p.lv + ';');
			}
		});

		var byIndex = {};
		plans.forEach(function (p) { byIndex[p.L.index] = p.L; });
		var refTo = function (info) {
			if (byIndex[info.index] && byIndex[info.index].name === info.name) return 'L[' + info.index + ']';
			return 'bin.find(comp, ' + str(info.name) + ', L)';
		};
		var on = function (L, k) { return !ex[L.attrsId] && !ex[L.attrsId + '/' + k]; };

		var links = [], mattes = [], locks = [], refs = false;
		plans.forEach(function (p) {
			var L = p.L;
			if (o.parent && L.parent && on(L, 'parent')) links.push(ind + 'bin.parent(L[' + L.index + '], ' + refTo(L.parent) + ');');
			if (L.matte && L.matte.name && on(L, 'matte')) mattes.push(ind + 'bin.matte(L[' + L.index + '], ' + refTo(L.matte) + ', ' + lit(L.matte.type) + ');');
			if (L.attrs.locked && on(L, 'locked')) locks.push(ind + 'L[' + L.index + '].locked = true;');
			if (!ex[L.id] && hasRef(L.groups, ex)) refs = true;
		});
		if (refs) { out.push(''); this.comment(out, ind, T('efeitos que apontam para outras layers')); out.push(ind + 'bin.links(comp, L);'); }
		if (links.length) { out.push(''); this.comment(out, ind, T('parentesco')); links.forEach(function (l) { out.push(l); }); }
		if (mattes.length) { out.push(''); this.comment(out, ind, T('track matte')); mattes.forEach(function (l) { out.push(l); }); }
		if (locks.length) { out.push(''); locks.forEach(function (l) { out.push(l); }); }

		var egp = CG.egpIn(C, plans.map(function (p) { return p.L; }), ex);
		if (egp.length) {
			out.push('');
			this.comment(out, ind, T(egp.length === 1 ? 'essential graphics (1 controle)' : 'essential graphics ({0} controles)', egp.length));
			out.push(ind + 'bin.egp(comp, L, [');
			egp.forEach(function (e, i) {
				out.push(ind + I + '{ n: ' + str(e.name) + ', l: ' + obj({ index: e.layer.index, name: e.layer.name }) + ', p: ' +
					'[' + e.path.map(function (s) { return obj({ name: s.name, mn: s.mn, i: s.i }); }).join(', ') + '] }' + (i < egp.length - 1 ? ',' : ''));
			});
			out.push(ind + ']' + (C.mgtName ? ', ' + str(C.mgtName) : '') + ');');
		}
	};

	function hasRef(nodes, ex) {
		return (nodes || []).some(function (n) { return !ex[n.id] && (n.lyr || hasRef(n.kids, ex)); });
	}

	// controles do essential graphics que entram: só no modo comp, com a layer de origem no script
	CG.egpIn = function (C, layers, ex) {
		ex = ex || {};
		if (!C.egp || ex[C.egpId]) return [];
		var on = {};
		(layers || []).forEach(function (L) { on[L.index] = L; });
		return C.egp.filter(function (e) {
			return !e.missing && e.layer && !ex[e.id] && on[e.layer.index] && on[e.layer.index].name === e.layer.name;
		});
	};

	Gen.prototype.compMarkers = function (C, ind, out) {
		if (!C.markers.length || this.ex[C.markersId]) return;
		out.push('');
		this.comment(out, ind, T('markers da comp'));
		this.markers(C.markers, C.markersId, 'comp', ind, out);
	};

	Gen.prototype.newComp = function (C, ind) {
		var ex = this.ex;
		var base = obj({ name: C.name, width: C.width, height: C.height, pixelAspect: C.pixelAspect, duration: C.duration, frameRate: C.frameRate });
		var extra = ex[C.settingsId] ? [] : CG.compAttrList(C).filter(function (a) { return !ex[C.settingsId + '/' + a.key]; });
		return 'bin.newComp(' + base + (extra.length ? ', ' + block(extra, ind) : '') + ')';
	};

	// planeja as layers de uma comp: nome da função (ou variável) e corpo
	Gen.prototype.plan = function (C, shared) {
		var o = this.o, self = this;
		return CG.layersIn(C, this.ex).map(function (L) {
			var namer = o.wrap ? new Namer() : shared;
			var fn = o.wrap ? self.top.take(T('criar_') + snake(L.name), T('criar'), true) : null;
			var lv = o.wrap ? 'layer' : namer.take(L.name, 'layer');
			var body = [];
			self.layer(L, lv, namer, I + I, body);
			return { L: L, fn: fn, lv: lv, body: body };
		});
	};

	Gen.prototype.layerFunctions = function (plans, out) {
		var self = this;
		plans.forEach(function (p) {
			self.comment(out, I, p.L.name + ' (' + p.L.type + ')');
			out.push(I + 'function ' + p.fn + '(comp) {');
			p.body.forEach(function (l) { out.push(l); });
			out.push(I + I + 'return layer;');
			out.push(I + '}');
			out.push('');
		});
	};

	// ------------------------------------------------------------- script --
	Gen.prototype.header = function (out) {
		var m = this.m, o = this.o;
		var d = o.now || new Date();
		var pad = function (n) { return (n < 10 ? '0' : '') + n; };
		var stamp = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
		var root = m.rootComp;
		out.push('/*');
		if (m.mode === 'comp') {
			var pre = this.comps.length - 1;
			out.push(' * BIN 3.0 · comp "' + plain(root.name) + '"' + (pre ? ' + ' + pre + ' ' + T(pre === 1 ? 'precomp' : 'precomps') : ''));
			out.push(' * ' + T('gerado em {0}', stamp));
			out.push(' *');
			out.push(' * ' + T(pre ? 'cria as comps no projeto, com todas as layers.' : 'cria a comp no projeto, com todas as layers.'));
		} else {
			var L = CG.layersIn(root, this.ex);
			out.push(' * BIN 3.0 · ' + (L.length === 1 ? 'layer "' + plain(L[0].name) + '"' : T('{0} layers', L.length)) + ' · comp "' + plain(root.name) + '"');
			out.push(' * ' + T('gerado em {0}', stamp));
			out.push(' *');
			out.push(' * ' + (o.target === 'new' ? T('recria as layers na nova comp "{0}".', plain(root.name)) : T('recria as layers na comp ativa.')));
		}
		out.push(' * File > Scripts > Run Script File...');
		out.push(' */');
	};

	Gen.prototype.layersScript = function (out) {
		var C = this.m.rootComp, o = this.o;
		var shared = new Namer(this.top);
		var plans = this.plan(C, shared);
		if (o.wrap) this.layerFunctions(plans, out);

		var names = plans.map(function (p) { return p.L.name; });
		out.push(I + 'var comp = ' + (o.target === 'new' ? this.newComp(C, I) : 'bin.comp()') + ';');
		out.push(I + 'if (!comp) return;');
		out.push(I + 'var L = {};');
		out.push(I + 'app.beginUndoGroup(' + str('BIN · ' + (names.length === 1 ? names[0] : T('{0} layers', names.length))) + ');');
		out.push(I + 'try {');
		this.compBody(C, plans, I + I, out);
		if (o.target === 'new') this.compMarkers(C, I + I, out);
		out.push(I + '} catch (e) {');
		out.push(I + I + "bin.err('script', e);");
		out.push(I + '}');
		out.push(I + 'app.endUndoGroup();');
		out.push(I + 'bin.done(comp, L);');
	};

	Gen.prototype.compScript = function (out) {
		var o = this.o, self = this;
		var rootC = this.m.rootComp;
		out.push(I + 'var C = {};');
		out.push('');

		var all = this.comps.map(function (C) {
			var shared = new Namer(self.top);
			return { C: C, plans: self.plan(C, shared), fn: self.top.take(T('criar_comp_') + snake(C.name), T('criar_comp'), true) };
		});

		if (o.wrap) all.forEach(function (c) {
			if (c.plans.length) { self.comment(out, I, '==== comp ' + c.C.name); out.push(''); }
			self.layerFunctions(c.plans, out);
		});

		all.forEach(function (c) {
			self.comment(out, I, T(c.C.root ? 'comp {0} (principal)' : 'comp {0} (precomp)', c.C.name));
			out.push(I + 'function ' + c.fn + '() {');
			out.push(I + I + 'var comp = ' + self.newComp(c.C, I + I) + ';');
			out.push(I + I + 'var L = {};');
			self.compBody(c.C, c.plans, I + I, out);
			self.compMarkers(c.C, I + I, out);
			out.push(I + I + 'return comp;');
			out.push(I + '}');
			out.push('');
		});

		out.push(I + 'app.beginUndoGroup(' + str('BIN · comp ' + rootC.name) + ');');
		out.push(I + 'try {');
		all.forEach(function (c) { out.push(I + I + 'C[' + c.C.id + '] = ' + c.fn + '();'); });
		out.push(I + '} catch (e) {');
		out.push(I + I + "bin.err('script', e);");
		out.push(I + '}');
		out.push(I + 'app.endUndoGroup();');
		out.push(I + 'bin.done(C[' + rootC.id + '], null, C);');
	};

	CG.generate = function (m, opts) {
		var prev = I18N && opts && opts.lang ? I18N.lang : null;
		if (prev) I18N.set(opts.lang);
		try { return generate(m, opts); } finally { if (prev) I18N.set(prev); }
	};

	function generate(m, opts) {
		var g = new Gen(m, opts);
		var out = [];
		g.ffx = ffxUsed(g);
		g.header(out);
		out.push('(function () {');
		CG.helpers().split('\n').forEach(function (l) { out.push(l ? I + l : ''); });
		out.push('');
		if (g.ffx) {
			g.comment(out, I, T('pseudo effects: .ffx salvos pelo After Effects. Numa máquina sem o efeito no PresetEffects.xml,'));
			g.comment(out, I, T('o script aplica o .ffx numa comp temporária para registrar o efeito e depois o cria normalmente.'));
			out.push(I + 'var FFX = {');
			var keys = Object.keys(g.ffx);
			keys.forEach(function (mn, i) { out.push(I + I + str(mn) + ': ' + CG.binaryString(g.ffx[mn]) + (i < keys.length - 1 ? ',' : '')); });
			out.push(I + '};');
			out.push('');
		}
		if (m.mode === 'comp') g.compScript(out);
		else g.layersScript(out);
		out.push('})();');
		out.push('');
		return out.join('\n');
	}

	// ============================================ auxiliares do script ======
	// Escrito como JS de verdade (ES3, roda no ExtendScript) e copiado para o script
	// gerado com toString(). Só o corpo entra, sem o "function binRuntime() {".
	function binRuntime() {
		// ---- BIN: funções auxiliares (erros por propriedade não interrompem o script)
		var bin = {
			errors: [],
			// "texto {0}" com os valores no lugar (as mensagens ficam inteiras para a tradução)
			f: function (s) { var a = arguments; return String(s).replace(/\{(\d)\}/g, function (m, n) { return a[+n + 1]; }); },
			err: function (what, e) { bin.errors.push(what + ': ' + (e && e.message ? e.message : e)); },
			path: function (p) {
				var n = [];
				try { while (p && p.parentProperty) { n.unshift(p.name); p = p.parentProperty; } } catch (e) { }
				return n.join(' > ');
			},
			// no lugar do que não pôde ser criado (efeito de plug-in ausente, pseudo effect não instalado...):
			// aceita as chamadas seguintes sem fazer nada, e o resto do script continua
			none: { property: function () { return bin.none; }, addProperty: function () { return bin.none; } },
			add: function (g, mn, name) {
				if (!g || g === bin.none) return bin.none;
				var p;
				try { p = g.addProperty(mn); } catch (e) {
					// pseudo effect: só existe se estiver no PresetEffects.xml desta máquina (ou registrado por um .ffx)
					bin.err('+ ' + mn, /^Pseudo\//.test(mn) ? 'pseudo effect não instalado nesta máquina. Salve o .ffx dele na aba utilitários do BIN e gere o script de novo.' : e);
					return bin.none;
				}
				if (name) try { p.name = name; } catch (e2) { }
				return p;
			},
			// pseudo effect com o .ffx embutido: se o AE não o conhece, o .ffx aplicado numa comp temporária o registra
			pseudo: function (g, mn, name, ffx) {
				if (!g || g === bin.none) return bin.none;
				var can = false;
				try { can = g.canAddProperty(mn); } catch (e) { }
				if (!can && ffx) bin.register(mn, ffx);
				return bin.add(g, mn, name);
			},
			register: function (mn, ffx) {
				var f = null, tmp = null, comp = app.project.activeItem, sel = [], i;
				try {
					f = new File(Folder.temp.fsName + '/BIN_' + mn.replace(/[^A-Za-z0-9]+/g, '_') + '.ffx');
					f.encoding = 'BINARY';
					f.open('w');
					f.write(ffx);
					f.close();
					if (comp instanceof CompItem) for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).selected) { sel.push(comp.layer(i)); comp.layer(i).selected = false; }
					tmp = app.project.items.addComp('BIN · registro do pseudo effect', 100, 100, 1, 1, 24);
					var l = tmp.layers.addShape();
					l.selected = true;
					l.applyPreset(f);
				} catch (e) {
					bin.err(bin.f('pseudo effect {0} (.ffx)', mn), e);
				} finally {
					if (tmp) try { tmp.remove(); } catch (e2) { }
					if (f) try { f.remove(); } catch (e3) { }
					for (i = 0; i < sel.length; i++) try { sel[i].selected = true; } catch (e4) { }
					if (comp instanceof CompItem) try { comp.openInViewer(); } catch (e5) { }
				}
			},
			attrs: function (o, a) {
				if (!o || o === bin.none) return;
				for (var k in a) {
					if (!a.hasOwnProperty(k)) continue;
					try {
						// já está assim, ou o AE não deixa mudar (canSetCollapseTransformation...): não mexe
						if (typeof a[k] !== 'object' && o[k] === a[k]) continue;
						if (o['canSet' + k.charAt(0).toUpperCase() + k.slice(1)] === false) continue;
					} catch (e0) { }
					try { o[k] = a[k]; } catch (e) { bin.err((o.name || '') + '.' + k, e); }
				}
			},
			shape: function (o) {
				var s = new Shape();
				s.vertices = o.v; s.inTangents = o.i; s.outTangents = o.o; s.closed = o.c;
				if (o.fs) {
					s.featherSegLocs = o.fs; s.featherRelSegLocs = o.ft; s.featherRadii = o.fr; s.featherInterps = o.fi;
					s.featherTensions = o.fn; s.featherTypes = o.fd; s.featherRelCornerAngles = o.fa;
				}
				return s;
			},
			doc: function (o) { o.__doc = true; return o; },
			// converte os valores marcados (textos) usando o documento atual da propriedade como base
			val: function (p, v) {
				if (!v || !v.__doc) return v;
				var d = p.value, k, q, r;
				var f = ['font', 'fontSize', 'applyFill', 'applyStroke', 'strokeWidth', 'strokeOverFill', 'justification', 'tracking', 'autoLeading',
					'baselineShift', 'horizontalScale', 'verticalScale', 'tsume', 'fauxBold', 'fauxItalic', 'allCaps', 'smallCaps', 'boxTextSize'];
				d.text = v.text;
				for (k = 0; k < f.length; k++) if (v[f[k]] !== undefined) try { d[f[k]] = v[f[k]]; } catch (e) { }
				if (v.applyFill && v.fillColor) try { d.fillColor = v.fillColor; } catch (e) { }
				if (v.applyStroke && v.strokeColor) try { d.strokeColor = v.strokeColor; } catch (e) { }
				if (!v.autoLeading && v.leading) try { d.leading = v.leading; } catch (e) { }
				if (v.runs && d.characterRange) {
					for (k = 0; k < v.runs.length; k++) {
						try {
							q = v.runs[k];
							r = d.characterRange(q.start, q.end);
							r.font = q.font; r.fontSize = q.fontSize; r.tracking = q.tracking;
							if (q.fillColor) r.fillColor = q.fillColor;
						} catch (e) { }
					}
				}
				return d;
			},
			set: function (p, v) {
				if (!p || p === bin.none) return;
				try { p.setValue(bin.val(p, v)); } catch (e) { bin.err(bin.path(p), e); }
			},
			keys: function (p, keys) {
				if (!p || p === bin.none) return;
				var I = { L: KeyframeInterpolationType.LINEAR, B: KeyframeInterpolationType.BEZIER, H: KeyframeInterpolationType.HOLD };
				var i, k, o;
				function ease(a) { var r = []; for (var n = 0; n < a.length; n++) r.push(new KeyframeEase(a[n][0], a[n][1])); return r; }
				try {
					while (p.numKeys > 0) p.removeKey(1); // ex.: o time remap já nasce com keys
					for (i = 0; i < keys.length; i++) p.setValueAtTime(keys[i].t, bin.val(p, keys[i].v));
				} catch (e) { bin.err(bin.path(p), e); return; }
				for (i = 0; i < keys.length; i++) {
					o = keys[i];
					k = p.nearestKeyIndex(o.t);
					if (o.i) try { p.setInterpolationTypeAtKey(k, I[o.i.charAt(0)], I[o.i.charAt(1)]); } catch (e) { }
					if (o.ta) try { p.setTemporalAutoBezierAtKey(k, true); } catch (e) { }
					else if (o.ei) try { p.setTemporalEaseAtKey(k, ease(o.ei), ease(o.eo)); } catch (e) { bin.err(bin.path(p) + ' (ease)', e); }
					if (o.tc) try { p.setTemporalContinuousAtKey(k, true); } catch (e) { }
					if (o.sa) try { p.setSpatialAutoBezierAtKey(k, true); } catch (e) { }
					else if (o.si) try { p.setSpatialTangentsAtKey(k, o.si, o.so); } catch (e) { }
					if (o.sc) try { p.setSpatialContinuousAtKey(k, true); } catch (e) { }
				}
				// roving só depois de todas as keys no lugar
				for (i = 0; i < keys.length; i++) if (keys[i].rv) try { p.setRovingAtKey(p.nearestKeyIndex(keys[i].t), true); } catch (e) { }
			},
			// onde fica uma propriedade: a layer dona e os índices até ela. Referências a propriedades
			// se perdem quando outras entram no mesmo grupo; a layer e o caminho continuam valendo
			loc: function (p) {
				var path = [], q = p, d = p.propertyDepth;
				for (var i = 0; i < d; i++) { path.unshift(q.propertyIndex); q = q.parentProperty; }
				return { layer: p.propertyGroup(d), path: path, mn: p.matchName };
			},
			at: function (r) {
				var p = r.layer;
				for (var k = 0; k < r.path.length; k++) p = p.property(r.path[k]);
				if (!p || p.matchName !== r.mn) throw new Error('a propriedade mudou de lugar');
				return p;
			},
			// as expressões entram só no fim, com todas as layers e comps prontas: assim nenhuma é avaliada
			// antes de as dependências existirem (o expression selector, por exemplo, não se recupera do erro)
			pend: [],
			expr: function (p, x, on) {
				if (!p || p === bin.none) return;
				try { bin.pend.push({ at: bin.loc(p), x: x, on: on }); return; } catch (e) { }
				try {
					p.expression = x;
					if (on === false) p.expressionEnabled = false;
				} catch (e2) { bin.err(bin.f('{0} (expressão)', bin.path(p)), e2); }
			},
			exprs: function () {
				var list = bin.pend;
				bin.pend = [];
				for (var i = 0; i < list.length; i++) {
					var e = list[i], p = null;
					try {
						p = e.get ? e.get() : bin.at(e.at);
						p.expression = e.x;
						if (e.on === false) p.expressionEnabled = false;
					} catch (err) { bin.err(bin.f('{0} (expressão)', e.label || (p ? bin.path(p) : e.at.layer.name + ' › ' + e.at.mn)), err); }
				}
			},
			// markers de layer ou de comp
			marker: function (o, t, m) {
				try {
					var mv = new MarkerValue(m.comment || '');
					for (var k in m) if (m.hasOwnProperty(k) && k !== 'comment' && k !== 'params') try { mv[k] = m[k]; } catch (e) { }
					if (m.params) mv.setParameters(m.params);
					(o.markerProperty || o.property('ADBE Marker')).setValueAtTime(t, mv);
				} catch (e) { bin.err(bin.f('marker {0}', t), e); }
			},
			// precomp ou footage: procura no projeto pelo nome; se não achar, importa o arquivo ou cria um solid no lugar
			source: function (comp, o) {
				var item = null, i, it;
				for (i = 1; i <= app.project.numItems && !item; i++) {
					it = app.project.item(i);
					if (it.name === o.name && (o.kind === 'comp' ? it instanceof CompItem : it instanceof FootageItem) && it !== comp) item = it;
				}
				if (!item && o.file && new File(o.file).exists) try { item = app.project.importFile(new ImportOptions(new File(o.file))); } catch (e) { }
				if (item) return comp.layers.add(item);
				bin.err(o.name, 'item não encontrado no projeto: criado um solid no lugar');
				return comp.layers.addSolid([0.5, 0.5, 0.5], bin.f('{0} [faltando]', o.name), o.width || comp.width, o.height || comp.height, 1);
			},
			comp: function () {
				var c = app.project.activeItem;
				if (c instanceof CompItem) return c;
				alert('BIN: abra (ou selecione) a comp onde as layers serão criadas.');
				return null;
			},
			newComp: function (o, a) {
				var c = app.project.items.addComp(o.name, o.width, o.height, o.pixelAspect, o.duration, o.frameRate);
				if (a) bin.attrs(c, a);
				return c;
			},
			find: function (comp, name, made) {
				for (var i = 1; i <= comp.numLayers; i++) {
					var l = comp.layer(i), mine = false;
					for (var k in made) if (made[k] === l) mine = true;
					if (l.name === name && !mine) return l;
				}
				bin.err(name, 'layer não encontrada na comp');
				return null;
			},
			// parâmetro que aponta para uma layer: guarda a layer dona e o caminho até ele (referências a
			// propriedades se perdem quando outros efeitos entram) e resolve em bin.links, com todas as layers prontas
			refs: [],
			ref: function (p, info) {
				if (!p || p === bin.none) return;
				try {
					var r = bin.loc(p);
					r.info = info;
					bin.refs.push(r);
				} catch (e) { bin.err(bin.path(p), e); }
			},
			links: function (comp, made) {
				var rest = [];
				for (var i = 0; i < bin.refs.length; i++) {
					var r = bin.refs[i];
					if (r.layer.containingComp.id !== comp.id) { rest.push(r); continue; }
					var t = made[r.info.index] && made[r.info.index].name === r.info.name ? made[r.info.index] : bin.find(comp, r.info.name, made);
					if (!t) continue;
					try { bin.at(r).setValue(t.index); } catch (e) { bin.err(r.layer.name + ' > ' + r.info.name, e); }
				}
				bin.refs = rest;
			},
			// um nível do caminho até a propriedade: pelo nome, pelo índice ou pelo matchName (o que bater)
			seg: function (g, s) {
				var tries = [s.name, s.i, s.mn];
				for (var t = 0; t < tries.length; t++) {
					try { var q = g.property(tries[t]); if (q && q.matchName === s.mn) return q; } catch (e) { }
				}
				return null;
			},
			// controles do essential graphics da comp, na mesma ordem e com os mesmos nomes
			egp: function (comp, made, list, title) {
				if (title) try { comp.motionGraphicsTemplateName = title; } catch (e0) { }
				for (var i = 0; i < list.length; i++) {
					var e = list[i], p = made[e.l.index];
					if (!p || p.name !== e.l.name) p = bin.find(comp, e.l.name, {});
					for (var k = 0; p && k < e.p.length; k++) p = bin.seg(p, e.p[k]);
					if (!p) { bin.err(bin.f('{0} (essential graphics)', e.n), bin.f('propriedade não encontrada em "{0}"', e.l.name)); continue; }
					try {
						if (p.addToMotionGraphicsTemplateAs) p.addToMotionGraphicsTemplateAs(comp, e.n);
						else p.addToMotionGraphicsTemplate(comp);
					} catch (err) { bin.err(bin.f('{0} (essential graphics)', e.n), err); }
				}
			},
			// valores e expressões das essential properties de uma layer de precomp
			ovp: function (l, names) {
				var p = null;
				try { p = l.property('ADBE Layer Overrides'); } catch (e0) { }
				for (var k = 0; p && k < names.length; k++) { try { p = p.property(names[k]); } catch (e1) { p = null; } }
				if (!p) throw new Error('essential property não encontrada');
				return p;
			},
			over: function (l, list) {
				for (var i = 0; i < list.length; i++) {
					var o = list[i], p;
					try { p = bin.ovp(l, o.n); } catch (e1) { bin.err(l.name + ' > ' + o.n.join(' > '), e1); continue; }
					if (o.v !== undefined) try { p.setValue(bin.val(p, o.v)); } catch (e2) { bin.err(l.name + ' > ' + o.n.join(' > '), e2); }
					// a expressão entra no fim, como as outras (o grupo é refeito pelo AE: guarda a layer e os nomes)
					if (o.x !== undefined) bin.pend.push({ get: (function (layer, names) { return function () { return bin.ovp(layer, names); }; })(l, o.n), x: o.x, on: o.on, label: l.name + ' > ' + o.n.join(' > ') });
				}
			},
			parent: function (l, p) {
				if (!l || !p) return;
				try {
					if (l.setParentWithJump) l.setParentWithJump(p); // mantém os valores de transform como estão
					else l.parent = p;
				} catch (e) { bin.err(l.name + ' > parent', e); }
			},
			matte: function (l, m, type) {
				if (!l) return;
				try {
					if (l.setTrackMatte && m) l.setTrackMatte(m, type); // AE 23+
					else l.trackMatteType = type;
				} catch (e) { bin.err(l.name + ' > track matte', e); }
			},
			// seleciona o que foi criado e deixa o resumo para o painel
			done: function (comp, made, comps) {
				var names = [], list = [], k, i;
				bin.exprs();
				try {
					if (made) {
						for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
						for (k in made) if (made.hasOwnProperty(k) && made[k]) { made[k].selected = true; names.push(made[k].name); }
					}
					for (k in comps) if (comps.hasOwnProperty(k) && comps[k]) list.push(comps[k].name);
					comp.openInViewer();
				} catch (e) { }
				$.global.BIN_LAST = { ok: true, comp: comp ? comp.name : '', count: comp ? comp.numLayers : 0, layers: names, comps: list, errors: bin.errors };
				if (!$.global.BIN_PANEL && bin.errors.length) alert(bin.f('BIN: {0} aviso(s)', bin.errors.length) + '\n\n' + bin.errors.slice(0, 12).join('\n'));
			}
		};
	}

	var HELPERS = null;
	// as auxiliares no idioma atual: textos entre aspas e comentários que estão no CSV são trocados
	CG.helpers = function () {
		var base = helpersPT();
		if (!I18N || I18N.lang === 'pt') return base;
		if (HELPERS_TR[I18N.lang]) return HELPERS_TR[I18N.lang];
		var out = base.replace(/'((?:[^'\\\n]|\\.)*)'/g, function (all, inner) {
			if (!I18N.table[inner]) return all;
			return "'" + T(inner).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
		}).replace(/\/\/ (.+)$/gm, function (all, c) { return I18N.table[c] ? '// ' + T(c) : all; });
		HELPERS_TR[I18N.lang] = out;
		return out;
	};
	var HELPERS_TR = {};

	function helpersPT() {
		if (HELPERS) return HELPERS;
		var src = binRuntime.toString();
		var lines = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}')).split('\n');
		while (lines.length && !lines[0].trim()) lines.shift();
		while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
		var indent = lines[0].match(/^\s*/)[0];
		HELPERS = lines.map(function (l) { return l.indexOf(indent) === 0 ? l.slice(indent.length) : l.replace(/^\s+/, ''); }).join('\n');
		return HELPERS;
	};

	// ========================================================== utilitários ==
	// expressões → string JS (uma linha por item do array, unidas com \n)
	CG.expressions = function (items) {
		var namer = new Namer();
		var out = [];
		items.forEach(function (it) {
			var v = namer.take('exp ' + it.name, 'exp');
			var lines = String(it.x).replace(/\s+$/, '').split(/\r\n|\r|\n/);
			out.push('// ' + plain(it.layer) + ' › ' + plain(it.path));
			if (lines.length === 1) out.push('var ' + v + ' = ' + str(lines[0]) + ';');
			else {
				out.push('var ' + v + ' = [');
				lines.forEach(function (l, i) { out.push(I + str(l) + (i < lines.length - 1 ? ',' : '')); });
				out.push("].join('\\n');");
			}
			out.push('');
		});
		return out.join('\n');
	};

	// bytes → string binária para ExtendScript (gravar com encoding BINARY ou usar direto no ScriptUI)
	CG.binaryString = function (bytes) {
		var out = ["'"];
		for (var i = 0; i < bytes.length; i++) {
			var b = bytes[i];
			if (b === 39) out.push("\\'");
			else if (b === 92) out.push('\\\\');
			else if (b === 10) out.push('\\n');
			else if (b === 13) out.push('\\r');
			else if (b === 9) out.push('\\t');
			else if (b >= 32 && b <= 126) out.push(String.fromCharCode(b));
			else out.push('\\x' + (b < 16 ? '0' : '') + b.toString(16).toUpperCase());
		}
		out.push("'");
		return out.join('');
	};

	CG.binaryFiles = function (files) {
		var namer = new Namer();
		var total = files.reduce(function (s, f) { return s + f.bytes.length; }, 0);
		var out = ['// ' + T('{0} arquivo(s)', files.length) + ' · ' + CG.size(total)];
		files.forEach(function (f) {
			var ext = (String(f.name).match(/\.([^.]+)$/) || [])[1] || '';
			var v = namer.take(String(f.name).replace(/\.[^.]+$/, '') + ' ' + ext, T('arquivo'));
			out.push('', '// ' + plain(f.name) + ' · ' + CG.size(f.bytes.length), 'var ' + v + ' = ' + CG.binaryString(f.bytes) + ';');
		});
		out.push('', '// ' + T('grava uma string binária de volta como arquivo'), 'function binToFile(str, path) {',
			I + 'var f = new File(path);', I + "f.encoding = 'BINARY';", I + "f.open('w');", I + 'f.write(str);', I + 'f.close();', I + 'return f;', '}', '');
		return out.join('\n');
	};

	CG.size = function (n) {
		if (n < 1024) return n + ' B';
		if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.', ',') + ' KB';
		return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
	};

	// no painel o CEP roda com Node.js (--enable-nodejs + --mixed-context): a página TAMBÉM tem 'module'.
	// por isso registra nos dois lugares, nunca um ou outro
	if (typeof window !== 'undefined') (window.BIN = window.BIN || {}).codegen = CG;
	if (typeof module !== 'undefined' && module.exports) module.exports = CG;
})(typeof window !== 'undefined' ? window : this);
