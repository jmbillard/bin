/*
 * BIN - host (ExtendScript / After Effects)
 *
 * Funções chamadas pelo painel via evalScript. Todas retornam uma string JSON.
 *
 * A captura é SOMENTE LEITURA: nada na layer original é alterado (o bin.js antigo
 * chamava setValue / renomeava propriedades para testar se eram graváveis, o que
 * sujava o histórico de undo). O painel recebe a descrição da layer e gera o
 * script de recriação.
 *
 * Formato dos valores enviados ao painel:
 *   número | string | boolean | array      → literal
 *   { e: 'BlendingMode.ADD' }               → constante do After Effects
 *   { shape: { v, i, o, c, ... } }           → new Shape()
 *   { doc: { text, font, ... } }             → TextDocument
 */

// ------------------------------------------------------------------ JSON --
function bin_json(v) {
	var t = typeof v;
	if (v === null || v === undefined) return 'null';
	if (t === 'number') return isFinite(v) ? String(v) : 'null';
	if (t === 'boolean') return v ? 'true' : 'false';
	if (t === 'string') {
		var out = '"';
		for (var i = 0; i < v.length; i++) {
			var c = v.charAt(i), code = v.charCodeAt(i);
			if (c === '"') out += '\\"';
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
		return out + '"';
	}
	if (Object.prototype.toString.call(v) === "[object Array]") {
		var a = [];
		for (var j = 0; j < v.length; j++) a.push(bin_json(v[j]));
		return '[' + a.join(',') + ']';
	}
	if (t === 'object') {
		var o = [];
		for (var k in v) {
			if (v.hasOwnProperty(k) && typeof v[k] !== 'function' && v[k] !== undefined) o.push(bin_json(k) + ':' + bin_json(v[k]));
		}
		return '{' + o.join(',') + '}';
	}
	return 'null';
}

function bin_error(e) {
	return bin_json({ error: (e && e.message ? e.message : String(e)) + (e && e.line ? ' (linha ' + e.line + ')' : '') });
}

// ---------------------------------------------------------- constantes --
// for..in não é confiável nos enums do ExtendScript: os nomes são listados aqui
var BIN_ENUMS = {
	BlendingMode: ['NORMAL', 'DISSOLVE', 'DANCING_DISSOLVE', 'DARKEN', 'MULTIPLY', 'COLOR_BURN', 'CLASSIC_COLOR_BURN', 'LINEAR_BURN', 'DARKER_COLOR',
		'ADD', 'LIGHTEN', 'SCREEN', 'COLOR_DODGE', 'CLASSIC_COLOR_DODGE', 'LINEAR_DODGE', 'LIGHTER_COLOR', 'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT',
		'LINEAR_LIGHT', 'VIVID_LIGHT', 'PIN_LIGHT', 'HARD_MIX', 'DIFFERENCE', 'CLASSIC_DIFFERENCE', 'EXCLUSION', 'SUBTRACT', 'DIVIDE', 'HUE',
		'SATURATION', 'COLOR', 'LUMINOSITY', 'STENCIL_ALPHA', 'STENCIL_LUMA', 'SILHOUETE_ALPHA', 'SILHOUETTE_LUMA', 'ALPHA_ADD', 'LUMINESCENT_PREMUL'],
	TrackMatteType: ['NO_TRACK_MATTE', 'ALPHA', 'ALPHA_INVERTED', 'LUMA', 'LUMA_INVERTED'],
	MaskMode: ['NONE', 'ADD', 'SUBTRACT', 'INTERSECT', 'LIGHTEN', 'DARKEN', 'DIFFERENCE'],
	MaskMotionBlur: ['SAME_AS_LAYER', 'ON', 'OFF'],
	MaskFeatherFalloff: ['FFO_LINEAR', 'FFO_SMOOTH'],
	LayerQuality: ['BEST', 'DRAFT', 'WIREFRAME'],
	LayerSamplingQuality: ['BILINEAR', 'BICUBIC'],
	FrameBlendingType: ['NO_FRAME_BLEND', 'FRAME_MIX', 'PIXEL_MOTION'],
	AutoOrientType: ['NO_AUTO_ORIENT', 'ALONG_PATH', 'CAMERA_OR_POINT_OF_INTEREST', 'CHARACTERS_TOWARD_CAMERA'],
	LightType: ['PARALLEL', 'SPOT', 'POINT', 'AMBIENT', 'ENVIRONMENT'],
	ParagraphJustification: ['LEFT_JUSTIFY', 'RIGHT_JUSTIFY', 'CENTER_JUSTIFY', 'FULL_JUSTIFY_LASTLINE_LEFT', 'FULL_JUSTIFY_LASTLINE_RIGHT',
		'FULL_JUSTIFY_LASTLINE_CENTER', 'FULL_JUSTIFY_LASTLINE_FULL']
};

function bin_enum(type, val) {
	var names = BIN_ENUMS[type];
	var obj;
	try { obj = $.global[type]; } catch (e) { obj = null; }
	if (names && obj) {
		for (var i = 0; i < names.length; i++) {
			try { if (obj[names[i]] === val) return { e: type + '.' + names[i] }; } catch (e2) { }
		}
	}
	return val;
}

function bin_interp(v) {
	if (v === KeyframeInterpolationType.HOLD) return 'H';
	if (v === KeyframeInterpolationType.LINEAR) return 'L';
	return 'B';
}

// lê um atributo sem deixar uma propriedade ausente derrubar a captura
function bin_try(obj, key) {
	try { return obj[key]; } catch (e) { return undefined; }
}

// --------------------------------------------------------------- valores --
// textos maiores que isso usam só o estilo geral (uma chamada à API por caractere fica lenta)
var BIN_MAX_RUN_CHARS = 2000;

var BIN_DOC_FIELDS = ['fontSize', 'applyFill', 'applyStroke', 'strokeWidth', 'strokeOverFill', 'tracking', 'leading', 'autoLeading',
	'baselineShift', 'horizontalScale', 'verticalScale', 'tsume', 'fauxBold', 'fauxItalic', 'allCaps', 'smallCaps', 'boxText'];

function bin_doc(td) {
	var d = { text: String(td.text).replace(/\r\n|\n/g, '\r'), font: bin_try(td, 'font') };
	for (var i = 0; i < BIN_DOC_FIELDS.length; i++) {
		var v = bin_try(td, BIN_DOC_FIELDS[i]);
		if (v !== undefined && v !== null) d[BIN_DOC_FIELDS[i]] = v;
	}
	var j = bin_try(td, 'justification');
	if (j !== undefined) d.justification = bin_enum('ParagraphJustification', j);
	if (d.applyFill) d.fillColor = bin_try(td, 'fillColor');
	if (d.applyStroke) d.strokeColor = bin_try(td, 'strokeColor');
	if (d.boxText) d.boxTextSize = bin_try(td, 'boxTextSize');

	// AE 24.3+: estilos por trecho (fonte, tamanho e cor diferentes no mesmo texto)
	try {
		if (typeof td.characterRange === 'function' && d.text.length > 1 && d.text.length <= BIN_MAX_RUN_CHARS) {
			var runs = [], cur = null;
			for (var c = 0; c < d.text.length; c++) {
				var r = td.characterRange(c, c + 1);
				var st = { font: r.font, fontSize: r.fontSize, fillColor: r.applyFill ? r.fillColor : null, tracking: r.tracking };
				var key = bin_json(st);
				if (cur && cur.key === key) cur.end = c + 1;
				else {
					cur = { key: key, start: c, end: c + 1, style: st };
					runs.push(cur);
				}
			}
			if (runs.length > 1) {
				d.runs = [];
				for (var k = 0; k < runs.length; k++) {
					var s = runs[k].style;
					var run = { start: runs[k].start, end: runs[k].end, font: s.font, fontSize: s.fontSize, tracking: s.tracking };
					if (s.fillColor) run.fillColor = s.fillColor;
					d.runs.push(run);
				}
			}
		}
	} catch (e) { }
	return { doc: d };
}

function bin_shape(s) {
	var o = { v: s.vertices, i: s.inTangents, o: s.outTangents, c: s.closed };
	try {
		if (s.featherSegLocs && s.featherSegLocs.length) {
			o.fs = s.featherSegLocs; o.ft = s.featherRelSegLocs; o.fr = s.featherRadii;
			o.fi = s.featherInterps; o.fn = s.featherTensions; o.fd = s.featherTypes; o.fa = s.featherRelCornerAngles;
		}
	} catch (e) { }
	return { shape: o };
}

function bin_val(p, v) {
	var t = p.propertyValueType;
	if (t === PropertyValueType.SHAPE) return bin_shape(v);
	if (t === PropertyValueType.TEXT_DOCUMENT) return bin_doc(v);
	return v;
}

function bin_keys(p) {
	var keys = [];
	var spatial = false;
	try { spatial = p.isSpatial && (p.propertyValueType === PropertyValueType.TwoD_SPATIAL || p.propertyValueType === PropertyValueType.ThreeD_SPATIAL); } catch (e) { }

	for (var k = 1; k <= p.numKeys; k++) {
		var key = { t: p.keyTime(k), v: bin_val(p, p.keyValue(k)) };
		try { key.i = bin_interp(p.keyInInterpolationType(k)) + bin_interp(p.keyOutInterpolationType(k)); } catch (e) { }
		try {
			var ein = p.keyInTemporalEase(k), eout = p.keyOutTemporalEase(k);
			key.ei = []; key.eo = [];
			for (var d = 0; d < ein.length; d++) {
				key.ei.push([ein[d].speed, ein[d].influence]);
				key.eo.push([eout[d].speed, eout[d].influence]);
			}
		} catch (e2) { delete key.ei; delete key.eo; }
		try { if (p.keyTemporalContinuous(k)) key.tc = true; } catch (e3) { }
		try { if (p.keyTemporalAutoBezier(k)) key.ta = true; } catch (e4) { }
		if (spatial) {
			try {
				key.si = p.keyInSpatialTangent(k);
				key.so = p.keyOutSpatialTangent(k);
				if (p.keySpatialContinuous(k)) key.sc = true;
				if (p.keySpatialAutoBezier(k)) key.sa = true;
				if (p.keyRoving(k)) key.rv = true;
			} catch (e5) { }
		}
		keys.push(key);
	}
	return keys;
}

// ----------------------------------------------------------- propriedades --
// grupos que o painel não sabe recriar (ou que são tratados à parte)
var BIN_SKIP = {
	'ADBE Marker': 1,               // capturado em layer.markers
	'ADBE Effect Mask Parade': 1,   // máscaras de efeito dependem das máscaras da layer
	'ADBE Layer Overrides': 1,      // essential properties
	'ADBE Layer Sets': 1
};

function bin_canAdd(parent) {
	try {
		if (parent.propertyType === PropertyType.INDEXED_GROUP) return true;
		if (parent.matchName === 'ADBE Text Animator Properties') return true;
	} catch (e) { }
	return false;
}

function bin_modified(p) {
	try { if (p.isModified) return true; } catch (e) { }
	try { if (p.numKeys > 0) return true; } catch (e2) { }
	try { if (p.expression !== '') return true; } catch (e3) { }
	return false;
}

// o grupo de propriedades de um animator de texto lista todas as ~30 possíveis, até as que não foram adicionadas.
// presente = o grupo não aceita adicioná-la de novo (quando esse sinal funciona) ou ela foi mexida (valor, keys, expressão)
function bin_animPresent(group) {
	var n = group.numProperties, can = [], any = false, all = true, i;
	for (i = 1; i <= n; i++) {
		var c;
		try { c = group.canAddProperty(group.property(i).matchName); } catch (e) { c = null; }
		can.push(c);
		if (c === true) any = true;
		if (c !== true) all = false;
	}
	// se aceita adicionar todas (ou nenhuma), o sinal não diz nada: fica só o "foi mexida"
	var useCan = any && !all;
	var out = [];
	for (i = 1; i <= n; i++) out.push((useCan && can[i - 1] === false) || bin_modified(group.property(i)));
	return out;
}

function bin_walk(group, ctx, path) {
	var out = [];
	var present = group.matchName === 'ADBE Text Animator Properties' ? bin_animPresent(group) : null;
	for (var i = 1; i <= group.numProperties; i++) {
		if (present && !present[i - 1]) continue;
		var node = null;
		try { node = bin_node(group.property(i), group, i, ctx, path); } catch (e) {
			ctx.warnings.push('não foi possível ler "' + path + ' › ' + bin_try(group.property(i), 'name') + '": ' + e.message);
		}
		if (node) out.push(node);
	}
	return out;
}

function bin_node(p, parent, idx, ctx, path) {
	var mn = p.matchName;
	var here = (path ? path + ' › ' : '') + p.name;

	if (BIN_SKIP[mn]) return null;

	if (mn === 'ADBE Layer Styles') {
		if (bin_try(p, 'canSetEnabled') && p.enabled) ctx.warnings.push('estilos de layer não são recriados (a API do After Effects não permite adicioná-los).');
		return null;
	}

	var add = bin_canAdd(parent);

	// grupo
	if (p.propertyType !== PropertyType.PROPERTY) {
		var kids = bin_walk(p, ctx, here);
		if (!add && !kids.length) return null;
		var g = { k: 'g', mn: mn, name: p.name, idx: idx, kids: kids };
		if (add) {
			g.add = true;
			if (bin_try(p, 'canSetEnabled') && p.enabled === false) g.off = true;
		}
		if (parent.matchName === 'ADBE Effect Parade') g.fx = true;
		if (mn === 'ADBE Mask Atom') {
			g.mask = {
				mode: bin_enum('MaskMode', p.maskMode),
				inverted: p.inverted,
				rotoBezier: bin_try(p, 'rotoBezier'),
				motionBlur: bin_enum('MaskMotionBlur', bin_try(p, 'maskMotionBlur')),
				falloff: bin_enum('MaskFeatherFalloff', bin_try(p, 'maskFeatherFalloff')),
				color: bin_try(p, 'color'),
				locked: bin_try(p, 'locked')
			};
		}
		return g;
	}

	// propriedade
	var vt = p.propertyValueType;
	if (vt === PropertyValueType.NO_VALUE || vt === PropertyValueType.CUSTOM_VALUE) return null;

	// posição com dimensões separadas: grava a chave e usa X / Y / Z
	if (mn === 'ADBE Position') {
		if (bin_try(p, 'dimensionsSeparated')) return { k: 'p', mn: mn, name: p.name, idx: idx, sep: true };
	}
	if (/^ADBE Position_\d$/.test(mn)) {
		var pos = parent.property('ADBE Position');
		if (!pos || !bin_try(pos, 'dimensionsSeparated')) return null;
	}
	if (mn === 'ADBE Time Remapping' && !ctx.layer.timeRemapEnabled) return null;

	var force = add || vt === PropertyValueType.TEXT_DOCUMENT;
	if (!force && !bin_modified(p)) return null;

	var n = { k: 'p', mn: mn, name: p.name, idx: idx };
	if (add) n.add = true;
	if (p.numKeys > 0) n.keys = bin_keys(p);
	else n.v = bin_val(p, p.value);

	// parâmetro que aponta para uma layer: o número muda na comp recriada, então guarda nome e posição
	if (vt === PropertyValueType.LAYER_INDEX && !p.numKeys && p.value > 0) {
		try {
			var ref = ctx.layer.containingComp.layer(p.value);
			if (ref) n.lyr = { name: ref.name, index: ref.index };
		} catch (e) { }
	}

	try {
		if (p.expression !== '') {
			n.x = p.expression;
			if (!p.expressionEnabled) n.xoff = true;
		}
	} catch (e) { }
	return n;
}

// ---------------------------------------------------------------- layer --
function bin_layerType(l) {
	if (l instanceof CameraLayer) return 'camera';
	if (l instanceof LightLayer) return 'light';
	if (l instanceof TextLayer) return 'text';
	if (l instanceof ShapeLayer) return 'shape';
	if (l.nullLayer) return 'null';
	var src = l.source;
	if (src instanceof CompItem) return 'precomp';
	try {
		if (src && src.mainSource instanceof SolidSource) return l.adjustmentLayer ? 'adjustment' : 'solid';
	} catch (e) { }
	return 'footage';
}

// shape e texto têm tudo de AVLayer (adjustment, 3D, blending, track matte...),
// mas no ExtendScript "layer instanceof AVLayer" dá false para elas
function bin_isAV(l) {
	return l instanceof AVLayer || l instanceof ShapeLayer || l instanceof TextLayer;
}

var BIN_ATTRS = {
	all: ['name', 'label', 'comment', 'enabled', 'shy', 'locked', 'startTime', 'stretch', 'inPoint', 'outPoint'],
	av: ['threeDLayer', 'motionBlur', 'adjustmentLayer', 'guideLayer', 'collapseTransformation', 'effectsActive', 'preserveTransparency', 'timeRemapEnabled', 'audioEnabled'],
	text: ['threeDPerChar']
};

// markers de uma layer ('ADBE Marker') ou de uma comp (comp.markerProperty)
function bin_markers(mk) {
	var out = [];
	if (!mk) return out;
	for (var k = 1; k <= mk.numKeys; k++) {
		var m = mk.keyValue(k);
		var o = { t: mk.keyTime(k), comment: m.comment, duration: m.duration };
		if (m.chapter) o.chapter = m.chapter;
		if (m.url) o.url = m.url;
		if (m.frameTarget) o.frameTarget = m.frameTarget;
		if (m.cuePointName) o.cuePointName = m.cuePointName;
		if (m.eventCuePoint) o.eventCuePoint = true;
		var lab = bin_try(m, 'label');
		if (lab) o.label = lab;
		if (bin_try(m, 'protectedRegion')) o.protectedRegion = true;
		try {
			var params = m.getParameters();
			for (var pk in params) {
				if (params.hasOwnProperty(pk)) { o.params = params; break; }
			}
		} catch (e) { }
		out.push(o);
	}
	return out;
}

function bin_layer(l) {
	var ctx = { layer: l, warnings: [] };
	var type = bin_layerType(l);
	var d = { index: l.index, name: l.name, type: type, attrs: {}, warnings: ctx.warnings };
	var i;

	var keys = BIN_ATTRS.all;
	if (bin_isAV(l)) keys = keys.concat(BIN_ATTRS.av);
	if (type === 'text') keys = keys.concat(BIN_ATTRS.text);
	for (i = 0; i < keys.length; i++) {
		var v = bin_try(l, keys[i]);
		if (v !== undefined && v !== null) d.attrs[keys[i]] = v;
	}
	if (bin_isAV(l)) {
		d.attrs.blendingMode = bin_enum('BlendingMode', l.blendingMode);
		d.attrs.quality = bin_enum('LayerQuality', l.quality);
		var sq = bin_try(l, 'samplingQuality');
		if (sq !== undefined) d.attrs.samplingQuality = bin_enum('LayerSamplingQuality', sq);
		d.attrs.frameBlendingType = bin_enum('FrameBlendingType', l.frameBlendingType);
		if (!l.hasAudio) delete d.attrs.audioEnabled;

		var tm = bin_try(l, 'trackMatteType');
		if (tm !== undefined && tm !== TrackMatteType.NO_TRACK_MATTE) {
			var matte = bin_try(l, 'trackMatteLayer'); // AE 23+
			if (!matte && l.index > 1) matte = l.containingComp.layer(l.index - 1);
			d.matte = { type: bin_enum('TrackMatteType', tm), name: matte ? matte.name : '', index: matte ? matte.index : 0 };
		}
	}
	d.attrs.autoOrient = bin_enum('AutoOrientType', l.autoOrient);

	// atributos que o AE não deixa mudar nesta layer (ex.: texto é sempre rasterizado continuamente,
	// shape e texto não têm time remap): o valor é fixo, não entra no script
	for (var ak in d.attrs) {
		if (d.attrs.hasOwnProperty(ak) && bin_try(l, 'canSet' + ak.charAt(0).toUpperCase() + ak.slice(1)) === false) delete d.attrs[ak];
	}
	if (type === 'adjustment') delete d.attrs.adjustmentLayer;

	// origem (precomp e footage: o painel decide se recria a comp ou procura o item pelo nome)
	var src = bin_try(l, 'source');
	if (type === 'solid' || type === 'adjustment') {
		d.source = { name: src.name, color: src.mainSource.color, width: src.width, height: src.height, pixelAspect: src.pixelAspect };
	} else if (type === 'precomp' || type === 'footage') {
		d.source = { id: src.id, name: src.name, kind: type === 'precomp' ? 'comp' : 'footage', width: src.width, height: src.height, duration: src.duration };
		try { if (src.mainSource && src.mainSource.file) d.source.file = src.mainSource.file.fsName; } catch (e) { }
	} else if (type === 'light') {
		var lt = bin_try(l, 'lightType');
		if (lt !== undefined) d.source = { lightType: bin_enum('LightType', lt) };
	}

	if (l.parent) d.parent = { name: l.parent.name, index: l.parent.index };

	d.markers = bin_markers(l.property('ADBE Marker'));
	d.groups = bin_walk(l, ctx, '');
	return d;
}

// ----------------------------------------------------------------- comp --
var BIN_COMP_ATTRS = ['bgColor', 'displayStartTime', 'workAreaStart', 'workAreaDuration', 'motionBlur', 'frameBlending', 'hideShyLayers',
	'draft3d', 'shutterAngle', 'shutterPhase', 'motionBlurSamplesPerFrame', 'motionBlurAdaptiveSampleLimit', 'preserveNestedFrameRate',
	'preserveNestedResolution', 'resolutionFactor', 'renderer', 'comment', 'label'];

function bin_compInfo(comp) {
	var d = {
		id: comp.id, name: comp.name, width: comp.width, height: comp.height, pixelAspect: comp.pixelAspect,
		duration: comp.duration, frameRate: comp.frameRate, settings: {}
	};
	for (var i = 0; i < BIN_COMP_ATTRS.length; i++) {
		var v = bin_try(comp, BIN_COMP_ATTRS[i]);
		if (v !== undefined && v !== null) d.settings[BIN_COMP_ATTRS[i]] = v;
	}
	d.markers = bin_markers(bin_try(comp, 'markerProperty')); // AE 14+
	return d;
}

function bin_layerList(comp, onlySelected) {
	var list = [], src = onlySelected ? comp.selectedLayers : null, i;
	if (src) for (i = 0; i < src.length; i++) list.push(src[i]);
	else for (i = 1; i <= comp.numLayers; i++) list.push(comp.layer(i));
	list.sort(function (a, b) { return a.index - b.index; });
	var out = [];
	for (i = 0; i < list.length; i++) out.push(bin_layer(list[i]));
	return out;
}

// comps em ordem de dependência: as precomps vêm antes de quem as usa
function bin_compTree(comp, seen, out) {
	if (seen[comp.id]) return;
	seen[comp.id] = true;
	for (var i = 1; i <= comp.numLayers; i++) {
		var src = bin_try(comp.layer(i), 'source');
		if (src instanceof CompItem) bin_compTree(src, seen, out);
	}
	var d = bin_compInfo(comp);
	d.layers = bin_layerList(comp, false);
	out.push(d);
}

function bin_activeComp() {
	var comp = app.project.activeItem;
	return comp instanceof CompItem ? comp : null;
}

// ------------------------------------------------------------ chamadas --
function bin_ping() {
	return bin_json({ ok: true, version: app.version });
}

// layers selecionadas na comp ativa
function bin_capture() {
	try {
		var comp = bin_activeComp();
		if (!comp) return bin_json({ error: 'abra uma comp e selecione uma layer.' });
		if (!comp.selectedLayers.length) return bin_json({ error: 'selecione ao menos uma layer na comp.' });
		return bin_json({ mode: 'layers', comp: bin_compInfo(comp), layers: bin_layerList(comp, true), ae: app.version });
	} catch (e) {
		return bin_error(e);
	}
}

// a comp ativa inteira, com todas as precomps usadas dentro dela
function bin_captureComp() {
	try {
		var comp = bin_activeComp();
		if (!comp) return bin_json({ error: 'abra uma comp (ou selecione uma no painel Project).' });
		var comps = [];
		bin_compTree(comp, {}, comps);
		return bin_json({ mode: 'comp', root: comp.id, comps: comps, ae: app.version });
	} catch (e) {
		return bin_error(e);
	}
}

// executa o script gerado pelo painel (arquivo temporário ou texto)
function bin_runFile(path) {
	try {
		$.global.BIN_LAST = null;
		$.global.BIN_PANEL = true;
		// um único undo, também para scripts digitados à mão na aba código
		app.beginUndoGroup('BIN · script');
		try { $.evalFile(new File(path)); } finally { app.endUndoGroup(); }
		$.global.BIN_PANEL = false;
		return bin_json($.global.BIN_LAST || { ok: true });
	} catch (e) {
		$.global.BIN_PANEL = false;
		return bin_error(e);
	}
}

function bin_run(code) {
	try {
		$.global.BIN_LAST = null;
		$.global.BIN_PANEL = true;
		app.beginUndoGroup('BIN · script');
		try { eval(code); } finally { app.endUndoGroup(); }
		$.global.BIN_PANEL = false;
		return bin_json($.global.BIN_LAST || { ok: true });
	} catch (e) {
		$.global.BIN_PANEL = false;
		return bin_error(e);
	}
}

function bin_undo() {
	try {
		app.executeCommand(16); // Edit > Undo
		return bin_json({ ok: true });
	} catch (e) {
		return bin_error(e);
	}
}

// ----------------------------------------------------------- expressões --
function bin_propPath(p) {
	var names = [];
	while (p && p.parentProperty) { names.unshift(p.name); p = p.parentProperty; }
	return names.join(' › ');
}

function bin_pushExpr(out, layer, p) {
	try {
		if (p.propertyType === PropertyType.PROPERTY && p.expression !== '') out.push({ layer: layer.name, path: bin_propPath(p), name: p.name, x: p.expression });
	} catch (e) { }
}

function bin_collectExpr(out, layer, group) {
	for (var i = 1; i <= group.numProperties; i++) {
		var p = group.property(i);
		if (p.propertyType === PropertyType.PROPERTY) bin_pushExpr(out, layer, p);
		else bin_collectExpr(out, layer, p);
	}
}

// expressões das propriedades selecionadas (ou de todas as layers selecionadas)
function bin_expressions() {
	try {
		var comp = bin_activeComp();
		if (!comp) return bin_json({ error: 'abra uma comp e selecione uma propriedade com expressão.' });
		var sel = comp.selectedLayers;
		if (!sel.length) return bin_json({ error: 'selecione uma propriedade com expressão.' });
		var out = [], i, j;

		for (i = 0; i < sel.length; i++) {
			var props = sel[i].selectedProperties;
			for (j = 0; j < props.length; j++) bin_pushExpr(out, sel[i], props[j]);
		}
		if (!out.length) for (i = 0; i < sel.length; i++) bin_collectExpr(out, sel[i], sel[i]);
		if (!out.length) return bin_json({ error: 'nenhuma expressão na seleção.' });
		return bin_json({ items: out });
	} catch (e) {
		return bin_error(e);
	}
}

// ----------------------------------------------------- template do padeiro --
// arquivos do template ao lado do projeto, com a mesma regra do padeiro:
// '<projeto>_config.json', '<projeto>_preview.png', '_script.js' e a pasta 'FONTS'.
// sem config com o nome do projeto, procura na pasta um '_config.json' cuja comp principal seja a comp ativa.
function bin_readText(f) {
	f.encoding = 'UTF-8';
	f.open('r');
	var t = f.read();
	f.close();
	return t;
}

function bin_templateInfo() {
	try {
		var proj = app.project.file;
		if (!proj) return bin_json({ project: null });
		var comp = bin_activeComp();
		var folder = proj.parent;
		var base = proj.name.replace(/\.[^.]+$/, '');
		base = decodeURI(base);
		var cfg = new File(folder.fsName + '/' + base + '_config.json');
		var text = null;

		if (cfg.exists) text = bin_readText(cfg);
		else if (comp) {
			var list = folder.getFiles('*_config.json');
			for (var i = 0; i < list.length && !text; i++) {
				try {
					var t = bin_readText(list[i]);
					if (t.indexOf('"' + comp.name + '"') >= 0) { text = t; cfg = list[i]; }
				} catch (e) { }
			}
		}

		var cfgBase = text ? cfg.fsName.replace(/_config\.json$/, '') : folder.fsName + '/' + base;
		var out = {
			project: proj.fsName,
			config: text,
			configPath: text ? cfg.fsName : null,
			preview: new File(cfgBase + '_preview.png').exists ? cfgBase + '_preview.png' : null,
			script: new File(cfgBase + '_script.js').exists,
			fonts: []
		};
		var fonts = new Folder(folder.fsName + '/FONTS');
		if (fonts.exists) {
			var ff = fonts.getFiles();
			for (var j = 0; j < ff.length; j++) if (ff[j] instanceof File) out.fonts.push(decodeURI(ff[j].name));
		}
		return bin_json(out);
	} catch (e) {
		return bin_error(e);
	}
}

// fallback para salvar quando o painel não tem acesso ao disco
function bin_saveText(text, name) {
	try {
		var f = File.saveDialog('exportar…', 'Script:*.jsx,Script:*.jsxinc,Texto:*.txt');
		if (!f) return bin_json({ cancelled: true });
		if (!/\.[a-z]+$/i.test(f.name)) f = new File(f.fsName + '.jsx');
		f.encoding = 'UTF-8';
		f.open('w');
		f.write(text);
		f.close();
		return bin_json({ ok: true, path: f.fsName });
	} catch (e) {
		return bin_error(e);
	}
}
