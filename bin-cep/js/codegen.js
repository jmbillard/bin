/*
 * BIN - gerador de código
 *
 * Transforma a captura (JSON vindo do host.jsx) em um script .jsx autônomo que
 * recria as layers em qualquer projeto. Não depende do DOM: roda no painel e no
 * Node (testes).
 *
 * O script gerado traz um pequeno objeto `bin` com funções auxiliares que
 * engolem erros propriedade a propriedade: uma propriedade que não existe na
 * versão do After Effects de destino não derruba o resto da layer. Os erros são
 * listados no final.
 */
(function (root) {
	'use strict';

	var CG = {};

	// ------------------------------------------------------------ literais --
	function num(n) {
		if (typeof n !== 'number' || !isFinite(n)) return '0';
		var r = Math.round(n * 10000) / 10000;
		if (r === 0) r = 0; // -0
		return String(r);
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
			else if (code < 32 || code > 126) {
				var h = code.toString(16);
				while (h.length < 4) h = '0' + h;
				out += '\\u' + h;
			} else out += c;
		}
		return out + "'";
	}

	var IDENT = /^[A-Za-z_$][\w$]*$/;
	var RESERVED = ('break case catch class const continue debugger default delete do else enum export extends false finally for ' +
		'function if import in instanceof new null return super switch this throw true try typeof var void while with yield ' +
		'let static implements interface package private protected public comp bin app layer undefined arguments eval').split(' ');

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
		var parts = [];
		Object.keys(o).forEach(function (k) {
			if (o[k] !== undefined) parts.push(key(k) + ': ' + lit(o[k]));
		});
		return '{ ' + parts.join(', ') + ' }';
	}

	CG.num = num;
	CG.str = str;
	CG.lit = lit;

	// --------------------------------------------------------------- nomes --
	function slug(s) {
		s = String(s || '').normalize ? String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(s || '');
		s = s.replace(/[^\w]+/g, ' ').trim();
		if (!s) return '';
		var words = s.split(/\s+/);
		var out = words.map(function (w, i) {
			w = w.toLowerCase();
			return i ? w.charAt(0).toUpperCase() + w.slice(1) : w;
		}).join('');
		if (/^\d/.test(out)) out = 'n' + out;
		return out;
	}
	CG.slug = slug;

	function snake(s) {
		s = String(s || '').normalize ? String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(s || '');
		s = s.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
		if (/^\d/.test(s)) s = 'n' + s;
		return s || 'layer';
	}
	CG.snake = snake;

	function Namer() { this.used = {}; }
	Namer.prototype.take = function (base, fallback, raw) {
		var b = (raw ? base : slug(base)) || fallback || 'grp';
		if (RESERVED.indexOf(b) >= 0) b += '_';
		var n = b, i = 2;
		while (this.used[n]) n = b + (i++);
		this.used[n] = true;
		return n;
	};

	// -------------------------------------------------------------- modelo --
	// numera os nós (ids estáveis para as caixas do painel) e marca matchNames repetidos
	CG.prepare = function (cap) {
		cap.layers.forEach(function (L, li) {
			L.id = 'L' + li;
			L.attrsId = L.id + '/attrs';
			L.markersId = L.id + '/markers';
			(function walk(nodes, pid) {
				var seen = {};
				nodes.forEach(function (n) { seen[n.mn] = (seen[n.mn] || 0) + 1; });
				nodes.forEach(function (n) {
					n.id = pid + '/' + n.idx;
					if (seen[n.mn] > 1) n.dup = true;
					if (n.kids) walk(n.kids, n.id);
				});
			})(L.groups, L.id);
		});
		return cap;
	};

	// atributos que só entram no código quando diferentes do padrão de uma layer nova
	var ATTR_DEFAULTS = {
		comment: '', enabled: true, shy: false, locked: false, stretch: 100, startTime: 0,
		threeDLayer: false, motionBlur: false, adjustmentLayer: false, guideLayer: false, collapseTransformation: false,
		effectsActive: true, preserveTransparency: false, timeRemapEnabled: false, audioEnabled: true, threeDPerChar: false,
		blendingMode: 'BlendingMode.NORMAL', quality: 'LayerQuality.BEST', samplingQuality: 'LayerSamplingQuality.BILINEAR',
		frameBlendingType: 'FrameBlendingType.NO_FRAME_BLEND', autoOrient: 'AutoOrientType.NO_AUTO_ORIENT'
	};
	var ATTR_EARLY = ['name', 'label', 'comment', 'threeDLayer', 'threeDPerChar', 'timeRemapEnabled', 'stretch', 'startTime'];
	var ATTR_LATE = ['inPoint', 'outPoint', 'enabled', 'shy', 'motionBlur', 'adjustmentLayer', 'guideLayer', 'collapseTransformation',
		'effectsActive', 'preserveTransparency', 'audioEnabled', 'blendingMode', 'quality', 'samplingQuality', 'frameBlendingType', 'autoOrient', 'locked'];

	function sameVal(a, b) {
		if (a && a.e) a = a.e;
		return a === b;
	}

	// atributos que valem a pena mostrar / gerar (a ordem importa: early antes das propriedades)
	CG.attrList = function (L) {
		var out = [];
		ATTR_EARLY.concat(ATTR_LATE).forEach(function (k) {
			if (!(k in L.attrs)) return;
			var v = L.attrs[k];
			if (k === 'autoOrient' && L.type === 'camera' && sameVal(v, 'AutoOrientType.CAMERA_OR_POINT_OF_INTEREST')) return;
			if (k in ATTR_DEFAULTS && sameVal(v, ATTR_DEFAULTS[k])) return;
			out.push({ key: k, v: v, late: ATTR_LATE.indexOf(k) >= 0 });
		});
		return out;
	};

	// contagens para o painel (respeita as exclusões)
	CG.stats = function (cap, opt) {
		var ex = (opt && opt.excluded) || {};
		var s = { props: 0, keys: 0, expr: 0, fx: 0 };
		cap.layers.forEach(function (L) {
			if (ex[L.id]) return;
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
		});
		return s;
	};

	// ------------------------------------------------------------- geração --
	var DEFAULT_OPTS = { target: 'active', wrap: true, parent: true, comments: true, keys: true, expr: true, excluded: {} };

	CG.generate = function (cap, opts) {
		var o = {};
		Object.keys(DEFAULT_OPTS).forEach(function (k) { o[k] = opts && k in opts ? opts[k] : DEFAULT_OPTS[k]; });
		var ex = o.excluded || {};
		var lines = [];
		var I = '\t';
		var layers = cap.layers.filter(function (L) { return !ex[L.id]; });

		function c(indent, text) { if (o.comments) lines.push(indent + '// ' + text); }

		// cabeçalho
		var d = o.now || new Date();
		var pad = function (n) { return (n < 10 ? '0' : '') + n; };
		var stamp = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
		lines.push('/*');
		lines.push(' * BIN 3.0 · ' + (layers.length === 1 ? 'layer "' + ascii(layers[0].name) + '"' : layers.length + ' layers') + ' · comp "' + ascii(cap.comp.name) + '"');
		lines.push(' * gerado em ' + stamp);
		lines.push(' *');
		lines.push(' * recria as layers na ' + (o.target === 'new' ? 'nova comp "' + ascii(cap.comp.name) + '"' : 'comp ativa') + '.');
		lines.push(' * File > Scripts > Run Script File...');
		lines.push(' */');
		lines.push('(function () {');
		HELPERS.split('\n').forEach(function (l) { lines.push(I + l); });
		lines.push('');

		var shared = new Namer();
		['L', 'bin', 'comp', 'layer'].forEach(function (n) { shared.used[n] = true; });
		var bodies = [];

		// uma função (ou bloco) por layer
		layers.forEach(function (L) {
			var namer = o.wrap ? new Namer() : shared;
			var fn = o.wrap ? shared.take('criar_' + snake(L.name), 'criar', true) : null;
			var lv = o.wrap ? 'layer' : namer.take(L.name, 'layer');
			if (o.wrap) ['comp', 'layer', 'bin'].forEach(function (n) { namer.used[n] = true; });
			var ind = o.wrap ? I + I : I + I;
			var body = [];
			emitLayer(L, lv, namer, ind, body);
			bodies.push({ L: L, fn: fn, lv: lv, body: body });
		});

		if (o.wrap) {
			bodies.forEach(function (b) {
				c(I, b.L.name + ' (' + b.L.type + ')');
				lines.push(I + 'function ' + b.fn + '(comp) {');
				b.body.forEach(function (l) { lines.push(l); });
				lines.push(I + I + 'return layer;');
				lines.push(I + '}');
				lines.push('');
			});
		}

		// execução
		var target = o.target === 'new'
			? obj({ name: cap.comp.name, width: cap.comp.width, height: cap.comp.height, pixelAspect: cap.comp.pixelAspect, duration: cap.comp.duration, frameRate: cap.comp.frameRate, bgColor: cap.comp.bgColor })
			: 'null';
		lines.push(I + 'var comp = bin.comp(' + target + ');');
		lines.push(I + 'if (!comp) return;');
		lines.push(I + 'var L = {};');
		lines.push(I + 'app.beginUndoGroup(' + str('BIN · ' + (layers.length === 1 ? layers[0].name : layers.length + ' layers')) + ');');
		lines.push(I + 'try {');

		// de baixo para cima: cada layer nova entra no topo, então a ordem final fica igual à original
		var order = bodies.slice().sort(function (a, b) { return b.L.index - a.L.index; });
		order.forEach(function (b) {
			var ref = 'L[' + b.L.index + ']';
			if (o.wrap) {
				lines.push(I + I + ref + ' = ' + b.fn + '(comp);');
			} else {
				lines.push('');
				c(I + I, '---- ' + b.L.name + ' (' + b.L.type + ')');
				b.body.forEach(function (l) { lines.push(l); });
				lines.push(I + I + ref + ' = ' + b.lv + ';');
			}
		});

		var byIndex = {};
		layers.forEach(function (L) { byIndex[L.index] = L; });
		function refTo(info) {
			if (byIndex[info.index] && byIndex[info.index].name === info.name) return 'L[' + info.index + ']';
			return 'bin.find(comp, ' + str(info.name) + ', L)';
		}

		var links = [];
		if (o.parent) layers.forEach(function (L) {
			if (L.parent && !ex[L.attrsId] && !ex[L.attrsId + '/parent']) links.push(I + I + 'bin.parent(L[' + L.index + '], ' + refTo(L.parent) + ');');
		});
		var mattes = [];
		layers.forEach(function (L) {
			if (L.matte && L.matte.name && !ex[L.attrsId] && !ex[L.attrsId + '/matte']) mattes.push(I + I + 'bin.matte(L[' + L.index + '], ' + refTo(L.matte) + ', ' + lit(L.matte.type) + ');');
		});
		if (links.length) { lines.push(''); c(I + I, 'parentesco'); links.forEach(function (l) { lines.push(l); }); }
		if (mattes.length) { lines.push(''); c(I + I, 'track matte'); mattes.forEach(function (l) { lines.push(l); }); }

		// trava depois de tudo pronto
		var locks = layers.filter(function (L) { return L.attrs.locked && !ex[L.attrsId] && !ex[L.attrsId + '/locked']; });
		if (locks.length) {
			lines.push('');
			locks.forEach(function (L) { lines.push(I + I + 'L[' + L.index + '].locked = true;'); });
		}

		lines.push(I + '} catch (e) {');
		lines.push(I + I + "bin.err('script', e);");
		lines.push(I + '}');
		lines.push(I + 'app.endUndoGroup();');
		lines.push(I + 'bin.done(comp, L);');
		lines.push('})();');
		lines.push('');
		return lines.join('\n');

		// ---------------------------------------------------------- layer --
		function emitLayer(L, lv, namer, ind, out) {
			var src = L.source || {};
			var make;
			switch (L.type) {
				case 'shape': make = 'comp.layers.addShape()'; break;
				case 'text': {
					var doc = textDoc(L);
					make = doc && doc.boxText && doc.boxTextSize ? 'comp.layers.addBoxText(' + lit(doc.boxTextSize) + ')' : 'comp.layers.addText()';
					break;
				}
				case 'null': make = 'comp.layers.addNull()'; break;
				case 'solid':
				case 'adjustment':
					make = 'comp.layers.addSolid(' + [lit(src.color), str(src.name), num(src.width), num(src.height), num(src.pixelAspect || 1)].join(', ') + ')';
					break;
				case 'camera': make = 'comp.layers.addCamera(' + str(L.name) + ', [comp.width / 2, comp.height / 2])'; break;
				case 'light': make = 'comp.layers.addLight(' + str(L.name) + ', [comp.width / 2, comp.height / 2])'; break;
				default: make = 'bin.source(comp, ' + obj({ name: src.name, kind: src.kind, file: src.file, width: src.width, height: src.height, duration: src.duration }) + ')';
			}
			out.push(ind + 'var ' + lv + ' = ' + make + ';');
			if (L.type === 'adjustment') out.push(ind + lv + '.adjustmentLayer = true;');
			if (L.type === 'light' && src.lightType) out.push(ind + 'bin.attrs(' + lv + ', { lightType: ' + lit(src.lightType) + ' });');

			var attrs = ex[L.attrsId] ? [] : CG.attrList(L).filter(function (a) { return a.key !== 'locked' && !ex[L.attrsId + '/' + a.key]; });
			var early = attrs.filter(function (a) { return !a.late; });
			var late = attrs.filter(function (a) { return a.late; });
			if (early.length) out.push(ind + 'bin.attrs(' + lv + ', ' + attrObj(early, ind) + ');');

			L.groups.forEach(function (n) { emitNode(n, lv, namer, ind, out); });

			if (L.markers && L.markers.length && !ex[L.markersId]) {
				out.push('');
				if (o.comments) out.push(ind + '// markers');
				L.markers.forEach(function (m, i) {
					if (ex[L.markersId + '/' + i]) return;
					var mo = {};
					Object.keys(m).forEach(function (k) { if (k !== 't') mo[k] = m[k]; });
					out.push(ind + 'bin.marker(' + lv + ', ' + num(m.t) + ', ' + obj(mo) + ');');
				});
			}
			if (late.length) {
				out.push('');
				out.push(ind + 'bin.attrs(' + lv + ', ' + attrObj(late, ind) + ');');
			}
		}

		function attrObj(list, ind) {
			if (list.length <= 2) return '{ ' + list.map(function (a) { return a.key + ': ' + lit(a.v); }).join(', ') + ' }';
			return '{\n' + list.map(function (a) { return ind + I + a.key + ': ' + lit(a.v); }).join(',\n') + '\n' + ind + '}';
		}

		function textDoc(L) {
			var tp = L.groups.filter(function (g) { return g.mn === 'ADBE Text Properties'; })[0];
			var td = tp && tp.kids.filter(function (k) { return k.mn === 'ADBE Text Document'; })[0];
			if (!td) return null;
			var v = td.v || (td.keys && td.keys[0].v);
			return v && v.doc;
		}

		function access(n, pv) {
			return n.dup ? pv + '.property(' + n.idx + ')' : pv + '.property(' + str(n.mn) + ')';
		}

		function hasContent(n) {
			if (ex[n.id]) return false;
			if (n.k !== 'g') return true;
			if (n.add) return true;
			return n.kids.some(hasContent);
		}

		function emitNode(n, pv, namer, ind, out) {
			if (!hasContent(n)) return;

			if (n.k === 'g') {
				var v = namer.take(n.name, 'grp');
				if (n.fx || (n.add && (n.mn === 'ADBE Vector Group' || n.mn === 'ADBE Mask Atom' || n.mn === 'ADBE Text Animator'))) {
					out.push('');
					if (o.comments) out.push(ind + '// ' + (n.fx ? 'efeito › ' : '') + n.name);
				} else if (!n.add && /^(ADBE Transform Group|ADBE Root Vectors Group|ADBE Effect Parade|ADBE Mask Parade|ADBE Text Properties|ADBE Camera Options Group|ADBE Light Options Group|ADBE Material Options Group|ADBE Audio Group)$/.test(n.mn)) {
					out.push('');
					if (o.comments) out.push(ind + '// ' + n.name.toLowerCase());
				}
				out.push(ind + 'var ' + v + ' = ' + (n.add ? 'bin.add(' + pv + ', ' + str(n.mn) + ', ' + str(n.name) + ')' : access(n, pv)) + ';');
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
				n.kids.forEach(function (k) { emitNode(k, v, namer, ind, out); });
				return;
			}

			// propriedade
			if (n.sep) {
				out.push(ind + access(n, pv) + '.dimensionsSeparated = true;');
				return;
			}
			var target = n.add ? 'bin.add(' + pv + ', ' + str(n.mn) + ')' : access(n, pv);
			var ops = [];
			var useKeys = n.keys && o.keys;
			var value = n.keys ? n.keys[0].v : n.v;
			if (useKeys) ops.push('keys');
			else if (value !== undefined) ops.push('set');
			if (n.x && o.expr) ops.push('expr');
			if (!ops.length) {
				if (n.add) out.push(ind + target + ';');
				return;
			}
			var t = target;
			if (ops.length > 1 || (n.add && ops.length)) {
				t = namer.take(n.name, 'prop');
				out.push(ind + 'var ' + t + ' = ' + target + ';');
			}
			ops.forEach(function (op) {
				if (op === 'set') out.push(ind + 'bin.set(' + t + ', ' + lit(value) + ');');
				if (op === 'keys') {
					out.push(ind + 'bin.keys(' + t + ', [');
					n.keys.forEach(function (k, i) {
						out.push(ind + I + keyLit(k) + (i < n.keys.length - 1 ? ',' : ''));
					});
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
		}

		function keyLit(k) {
			var ko = { t: k.t, v: k.v };
			if (k.i) ko.i = k.i;
			if (k.ei && /B/.test(k.i || 'B') && !k.ta) {
				ko.ei = k.ei.map(function (e) { return [e[0], Math.max(0.1, Math.min(100, e[1]))]; });
				ko.eo = k.eo.map(function (e) { return [e[0], Math.max(0.1, Math.min(100, e[1]))]; });
			}
			['tc', 'ta', 'sc', 'sa', 'rv'].forEach(function (f) { if (k[f]) ko[f] = true; });
			var zero = function (a) { return !a || a.every(function (x) { return x === 0; }); };
			if (k.si && !k.sa && !(zero(k.si) && zero(k.so))) { ko.si = k.si; ko.so = k.so; }
			return obj(ko);
		}
	};

	function ascii(s) { return String(s).replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /'); }

	// --------------------------------------------- auxiliares do script ----
	var HELPERS = [
		'// ---- funções auxiliares do BIN (erros por propriedade não interrompem o script)',
		'var bin = {',
		'\terrors: [],',
		'\terr: function (what, e) { bin.errors.push(what + \': \' + (e && e.message ? e.message : e)); },',
		'\tpath: function (p) { var n = []; try { while (p && p.parentProperty) { n.unshift(p.name); p = p.parentProperty; } } catch (e) { } return n.join(\' > \'); },',
		'\tadd: function (g, mn, name) {',
		'\t\tif (!g) return null;',
		'\t\ttry { var p = g.addProperty(mn); } catch (e) { bin.err(\'+ \' + mn, e); return null; }',
		'\t\tif (name) try { p.name = name; } catch (e2) { }',
		'\t\treturn p;',
		'\t},',
		'\tshape: function (o) {',
		'\t\tvar s = new Shape();',
		'\t\ts.vertices = o.v; s.inTangents = o.i; s.outTangents = o.o; s.closed = o.c;',
		'\t\tif (o.fs) { s.featherSegLocs = o.fs; s.featherRelSegLocs = o.ft; s.featherRadii = o.fr; s.featherInterps = o.fi; s.featherTensions = o.fn; s.featherTypes = o.fd; s.featherRelCornerAngles = o.fa; }',
		'\t\treturn s;',
		'\t},',
		'\tdoc: function (o) { o.__doc = true; return o; },',
		'\tval: function (p, v) {',
		'\t\tif (!v || !v.__doc) return v;',
		'\t\tvar d = p.value, k, f = [\'font\', \'fontSize\', \'applyFill\', \'applyStroke\', \'strokeWidth\', \'strokeOverFill\', \'justification\', \'tracking\', \'autoLeading\',',
		'\t\t\t\'baselineShift\', \'horizontalScale\', \'verticalScale\', \'tsume\', \'fauxBold\', \'fauxItalic\', \'allCaps\', \'smallCaps\', \'boxTextSize\'];',
		'\t\td.text = v.text;',
		'\t\tfor (k = 0; k < f.length; k++) if (v[f[k]] !== undefined) try { d[f[k]] = v[f[k]]; } catch (e) { }',
		'\t\tif (v.applyFill && v.fillColor) try { d.fillColor = v.fillColor; } catch (e) { }',
		'\t\tif (v.applyStroke && v.strokeColor) try { d.strokeColor = v.strokeColor; } catch (e) { }',
		'\t\tif (!v.autoLeading && v.leading) try { d.leading = v.leading; } catch (e) { }',
		'\t\tif (v.runs && d.characterRange) for (k = 0; k < v.runs.length; k++) try {',
		'\t\t\tvar r = d.characterRange(v.runs[k].start, v.runs[k].end), q = v.runs[k];',
		'\t\t\tr.font = q.font; r.fontSize = q.fontSize; r.tracking = q.tracking;',
		'\t\t\tif (q.fillColor) r.fillColor = q.fillColor;',
		'\t\t} catch (e) { }',
		'\t\treturn d;',
		'\t},',
		'\tset: function (p, v) {',
		'\t\tif (!p) return;',
		'\t\ttry { p.setValue(bin.val(p, v)); } catch (e) { bin.err(bin.path(p), e); }',
		'\t},',
		'\tkeys: function (p, keys) {',
		'\t\tif (!p) return;',
		'\t\tvar I = { L: KeyframeInterpolationType.LINEAR, B: KeyframeInterpolationType.BEZIER, H: KeyframeInterpolationType.HOLD };',
		'\t\tvar i, j, k, o;',
		'\t\tfunction ease(a) { var r = []; for (var n = 0; n < a.length; n++) r.push(new KeyframeEase(a[n][0], a[n][1])); return r; }',
		'\t\ttry { for (i = 0; i < keys.length; i++) p.setValueAtTime(keys[i].t, bin.val(p, keys[i].v)); } catch (e) { bin.err(bin.path(p), e); return; }',
		'\t\tfor (i = 0; i < keys.length; i++) {',
		'\t\t\to = keys[i];',
		'\t\t\tk = p.nearestKeyIndex(o.t);',
		'\t\t\tif (o.i) try { p.setInterpolationTypeAtKey(k, I[o.i.charAt(0)], I[o.i.charAt(1)]); } catch (e) { }',
		'\t\t\tif (o.ta) try { p.setTemporalAutoBezierAtKey(k, true); } catch (e) { }',
		'\t\t\telse if (o.ei) try { p.setTemporalEaseAtKey(k, ease(o.ei), ease(o.eo)); } catch (e) { bin.err(bin.path(p) + \' (ease)\', e); }',
		'\t\t\tif (o.tc) try { p.setTemporalContinuousAtKey(k, true); } catch (e) { }',
		'\t\t\tif (o.sa) try { p.setSpatialAutoBezierAtKey(k, true); } catch (e) { }',
		'\t\t\telse if (o.si) try { p.setSpatialTangentsAtKey(k, o.si, o.so); } catch (e) { }',
		'\t\t\tif (o.sc) try { p.setSpatialContinuousAtKey(k, true); } catch (e) { }',
		'\t\t}',
		'\t\tfor (j = 0; j < keys.length; j++) if (keys[j].rv) try { p.setRovingAtKey(p.nearestKeyIndex(keys[j].t), true); } catch (e) { }',
		'\t},',
		'\texpr: function (p, x, on) {',
		'\t\tif (!p) return;',
		'\t\ttry { p.expression = x; if (on === false) p.expressionEnabled = false; } catch (e) { bin.err(bin.path(p) + \' (expressão)\', e); }',
		'\t},',
		'\tattrs: function (o, a) {',
		'\t\tif (!o) return;',
		'\t\tfor (var k in a) if (a.hasOwnProperty(k)) try { o[k] = a[k]; } catch (e) { bin.err((o.name || \'\') + \'.\' + k, e); }',
		'\t},',
		'\tmarker: function (l, t, o) {',
		'\t\ttry {',
		'\t\t\tvar m = new MarkerValue(o.comment || \'\');',
		'\t\t\tfor (var k in o) if (o.hasOwnProperty(k) && k !== \'comment\' && k !== \'params\') try { m[k] = o[k]; } catch (e) { }',
		'\t\t\tif (o.params) m.setParameters(o.params);',
		'\t\t\tl.property(\'ADBE Marker\').setValueAtTime(t, m);',
		'\t\t} catch (e) { bin.err(\'marker \' + t, e); }',
		'\t},',
		'\tsource: function (comp, o) {',
		'\t\tvar item = null, i, it;',
		'\t\tfor (i = 1; i <= app.project.numItems && !item; i++) {',
		'\t\t\tit = app.project.item(i);',
		'\t\t\tif (it.name === o.name && (o.kind === \'comp\' ? it instanceof CompItem : it instanceof FootageItem) && it !== comp) item = it;',
		'\t\t}',
		'\t\tif (!item && o.file && new File(o.file).exists) try { item = app.project.importFile(new ImportOptions(new File(o.file))); } catch (e) { }',
		'\t\tif (item) return comp.layers.add(item);',
		'\t\tbin.err(o.name, \'item não encontrado no projeto: criado um solid no lugar\');',
		'\t\tvar s = comp.layers.addSolid([0.5, 0.5, 0.5], o.name + \' [faltando]\', o.width || comp.width, o.height || comp.height, 1);',
		'\t\treturn s;',
		'\t},',
		'\tcomp: function (o) {',
		'\t\tif (!o) {',
		'\t\t\tvar c = app.project.activeItem;',
		'\t\t\tif (c instanceof CompItem) return c;',
		'\t\t\talert(\'BIN: abra (ou selecione) a comp onde as layers serão criadas.\');',
		'\t\t\treturn null;',
		'\t\t}',
		'\t\tvar n = app.project.items.addComp(o.name, o.width, o.height, o.pixelAspect, o.duration, o.frameRate);',
		'\t\tn.bgColor = o.bgColor;',
		'\t\tn.openInViewer();',
		'\t\treturn n;',
		'\t},',
		'\tfind: function (comp, name, made) {',
		'\t\tfor (var i = 1; i <= comp.numLayers; i++) {',
		'\t\t\tvar l = comp.layer(i), mine = false;',
		'\t\t\tfor (var k in made) if (made[k] === l) mine = true;',
		'\t\t\tif (l.name === name && !mine) return l;',
		'\t\t}',
		'\t\tbin.err(name, \'layer não encontrada na comp\');',
		'\t\treturn null;',
		'\t},',
		'\tparent: function (l, p) {',
		'\t\tif (!l || !p) return;',
		'\t\ttry { if (l.setParentWithJump) l.setParentWithJump(p); else l.parent = p; } catch (e) { bin.err(l.name + \' > parent\', e); }',
		'\t},',
		'\tmatte: function (l, m, type) {',
		'\t\tif (!l) return;',
		'\t\ttry { if (l.setTrackMatte && m) l.setTrackMatte(m, type); else l.trackMatteType = type; } catch (e) { bin.err(l.name + \' > track matte\', e); }',
		'\t},',
		'\tdone: function (comp, made) {',
		'\t\tvar names = [];',
		'\t\ttry {',
		'\t\t\tfor (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;',
		'\t\t\tfor (var k in made) if (made.hasOwnProperty(k) && made[k]) { made[k].selected = true; names.push(made[k].name); }',
		'\t\t} catch (e) { }',
		'\t\t$.global.BIN_LAST = { ok: true, comp: comp.name, layers: names, errors: bin.errors };',
		'\t\tif (!$.global.BIN_PANEL && bin.errors.length) alert(\'BIN: \' + bin.errors.length + \' aviso(s)\\n\\n\' + bin.errors.slice(0, 12).join(\'\\n\'));',
		'\t}',
		'};'
	].join('\n');

	// ------------------------------------------------------- utilitários ---
	// expressões → string JS (uma linha por item do array, unidas com \n)
	CG.expressions = function (items) {
		var namer = new Namer();
		var out = [];
		items.forEach(function (it) {
			var v = namer.take('exp ' + it.name, 'exp');
			var lines = String(it.x).replace(/\s+$/, '').split(/\r\n|\r|\n/);
			out.push('// ' + ascii(it.layer) + ' › ' + ascii(it.path));
			if (lines.length === 1) out.push('var ' + v + ' = ' + str(lines[0]) + ';');
			else {
				out.push('var ' + v + ' = [');
				lines.forEach(function (l, i) { out.push('\t' + str(l) + (i < lines.length - 1 ? ',' : '')); });
				out.push("].join('\\n');");
			}
			out.push('');
		});
		return out.join('\n');
	};

	// bytes → string binária para ExtendScript (gravar com encoding BINARY ou usar direto no ScriptUI)
	CG.binaryString = function (bytes) {
		var out = "'";
		for (var i = 0; i < bytes.length; i++) {
			var b = bytes[i];
			if (b === 39) out += "\\'";
			else if (b === 92) out += '\\\\';
			else if (b === 10) out += '\\n';
			else if (b === 13) out += '\\r';
			else if (b === 9) out += '\\t';
			else if (b >= 32 && b <= 126) out += String.fromCharCode(b);
			else out += '\\x' + (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
		}
		return out + "'";
	};

	CG.binaryFiles = function (files) {
		var namer = new Namer();
		var out = [];
		var total = files.reduce(function (s, f) { return s + f.bytes.length; }, 0);
		out.push('// ' + files.length + ' arquivo(s) · ' + CG.size(total));
		files.forEach(function (f) {
			var base = String(f.name).replace(/\.[^.]+$/, '');
			var ext = (String(f.name).match(/\.([^.]+)$/) || [])[1] || '';
			var v = namer.take(base + ' ' + ext, 'arquivo');
			out.push('');
			out.push('// ' + ascii(f.name) + ' · ' + CG.size(f.bytes.length));
			out.push('var ' + v + ' = ' + CG.binaryString(f.bytes) + ';');
		});
		out.push('');
		out.push('// grava uma string binária de volta como arquivo');
		out.push('function binToFile(str, path) {');
		out.push('\tvar f = new File(path);');
		out.push("\tf.encoding = 'BINARY';");
		out.push("\tf.open('w');");
		out.push('\tf.write(str);');
		out.push('\tf.close();');
		out.push('\treturn f;');
		out.push('}');
		out.push('');
		return out.join('\n');
	};

	CG.size = function (n) {
		if (n < 1024) return n + ' B';
		if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.', ',') + ' KB';
		return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
	};

	if (typeof module !== 'undefined' && module.exports) module.exports = CG;
	else (root.BIN = root.BIN || {}).codegen = CG;
})(typeof window !== 'undefined' ? window : this);
