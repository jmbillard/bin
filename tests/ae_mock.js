// Mock mínimo do modelo de objetos do After Effects, suficiente para:
//  - rodar o jsx/host.jsx (captura) em Node;
//  - executar o script gerado pelo codegen (recriação).
// Só cobre as propriedades usadas nos testes; o comportamento segue a documentação do AE.
'use strict';
const fs = require('fs');
const vm = require('vm');

function makeEnum(names, base) {
	const o = {};
	names.forEach((n, i) => { o[n] = base + i; });
	return o;
}

const PropertyType = { PROPERTY: 6812, INDEXED_GROUP: 6813, NAMED_GROUP: 6814 };
const PropertyValueType = makeEnum(['NO_VALUE', 'ThreeD_SPATIAL', 'ThreeD', 'TwoD_SPATIAL', 'TwoD', 'OneD', 'COLOR', 'CUSTOM_VALUE',
	'MARKER', 'LAYER_INDEX', 'MASK_INDEX', 'SHAPE', 'TEXT_DOCUMENT'], 6412);
const KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };

const ENUM_NAMES = {
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
	LightType: ['PARALLEL', 'SPOT', 'POINT', 'AMBIENT'],
	ParagraphJustification: ['LEFT_JUSTIFY', 'RIGHT_JUSTIFY', 'CENTER_JUSTIFY', 'FULL_JUSTIFY_LASTLINE_LEFT', 'FULL_JUSTIFY_LASTLINE_RIGHT',
		'FULL_JUSTIFY_LASTLINE_CENTER', 'FULL_JUSTIFY_LASTLINE_FULL']
};
const ENUMS = {};
let base = 5000;
for (const k in ENUM_NAMES) { ENUMS[k] = makeEnum(ENUM_NAMES[k], base); base += 100; }

const VT = PropertyValueType;
// pseudo effects instalados no PresetEffects.xml desta "máquina" (os testes desligam para simular outra)
const ENV = { pseudo: true, registered: {} };
const clone = (v) => (v && typeof v === 'object') ? (typeof v.clone === 'function' ? v.clone() : JSON.parse(JSON.stringify(v))) : v;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------- valores --
class Shape {
	constructor() { this.vertices = []; this.inTangents = []; this.outTangents = []; this.closed = true; this.featherSegLocs = []; }
	clone() { const s = new Shape(); Object.assign(s, JSON.parse(JSON.stringify(this))); return s; }
	toJSON() { return { vertices: this.vertices, inTangents: this.inTangents, outTangents: this.outTangents, closed: this.closed }; }
}
class TextDocument {
	constructor(text) {
		this.text = text || ''; this.font = 'ArialMT'; this.fontSize = 36; this.applyFill = true; this.fillColor = [1, 1, 1];
		this.applyStroke = false; this.strokeColor = [0, 0, 0]; this.strokeWidth = 1; this.strokeOverFill = false; this.tracking = 0;
		this.leading = 43.2; this.autoLeading = true; this.justification = ENUMS.ParagraphJustification.LEFT_JUSTIFY;
		this.baselineShift = 0; this.horizontalScale = 1; this.verticalScale = 1; this.tsume = 0; this.fauxBold = false; this.fauxItalic = false;
		this.allCaps = false; this.smallCaps = false; this.boxText = false; this.pointText = true;
	}
	clone() { const d = new TextDocument(); Object.assign(d, JSON.parse(JSON.stringify(this))); return d; }
	toJSON() { const o = Object.assign({}, this); return o; }
}
class KeyframeEase { constructor(speed, influence) { this.speed = speed; this.influence = influence; } }
class MarkerValue {
	constructor(comment) { this.comment = comment; this.duration = 0; this.chapter = ''; this.url = ''; this.frameTarget = ''; this.cuePointName = ''; this.eventCuePoint = false; this.label = 0; this.protectedRegion = false; this._params = {}; }
	getParameters() { return Object.assign({}, this._params); }
	setParameters(p) { this._params = Object.assign({}, p); }
	clone() { const m = new MarkerValue(this.comment); Object.assign(m, JSON.parse(JSON.stringify(this))); return m; }
}

// ------------------------------------------------------- especificações --
const DIMS = { [VT.ThreeD_SPATIAL]: 3, [VT.ThreeD]: 3, [VT.TwoD_SPATIAL]: 2, [VT.TwoD]: 2, [VT.OneD]: 1, [VT.COLOR]: 4 };
const P = (mn, name, vt, def) => ({ kind: 'p', mn, name, vt, def });
const G = (mn, name, kids, extra) => Object.assign({ kind: 'named', mn, name, kids: kids || [] }, extra || {});
const IG = (mn, name, addable) => ({ kind: 'indexed', mn, name, addable });

const vectorTransform = () => G('ADBE Vector Transform Group', 'Transform', [
	P('ADBE Vector Anchor', 'Anchor Point', VT.TwoD_SPATIAL, [0, 0]),
	P('ADBE Vector Position', 'Position', VT.TwoD_SPATIAL, [0, 0]),
	P('ADBE Vector Scale', 'Scale', VT.TwoD, [100, 100]),
	P('ADBE Vector Rotation', 'Rotation', VT.OneD, 0),
	P('ADBE Vector Group Opacity', 'Opacity', VT.OneD, 100)
]);
const SHAPE_ITEMS = {};
SHAPE_ITEMS['ADBE Vector Shape - Rect'] = () => G('ADBE Vector Shape - Rect', 'Rectangle Path 1', [
	P('ADBE Vector Shape Direction', 'Shape Direction', VT.OneD, 1),
	P('ADBE Vector Rect Size', 'Size', VT.TwoD, [100, 100]),
	P('ADBE Vector Rect Position', 'Position', VT.TwoD_SPATIAL, [0, 0]),
	P('ADBE Vector Rect Roundness', 'Roundness', VT.OneD, 0)
]);
SHAPE_ITEMS['ADBE Vector Shape - Ellipse'] = () => G('ADBE Vector Shape - Ellipse', 'Ellipse Path 1', [
	P('ADBE Vector Ellipse Size', 'Size', VT.TwoD, [100, 100]),
	P('ADBE Vector Ellipse Position', 'Position', VT.TwoD_SPATIAL, [0, 0])
]);
SHAPE_ITEMS['ADBE Vector Shape - Group'] = () => G('ADBE Vector Shape - Group', 'Path 1', [P('ADBE Vector Shape', 'Path', VT.SHAPE, null)]);
SHAPE_ITEMS['ADBE Vector Graphic - Fill'] = () => G('ADBE Vector Graphic - Fill', 'Fill 1', [
	P('ADBE Vector Fill Color', 'Color', VT.COLOR, [1, 0, 0, 1]),
	P('ADBE Vector Fill Opacity', 'Opacity', VT.OneD, 100)
]);
SHAPE_ITEMS['ADBE Vector Graphic - Stroke'] = () => G('ADBE Vector Graphic - Stroke', 'Stroke 1', [
	P('ADBE Vector Stroke Color', 'Color', VT.COLOR, [1, 1, 1, 1]),
	P('ADBE Vector Stroke Width', 'Stroke Width', VT.OneD, 2)
]);
SHAPE_ITEMS['ADBE Vector Group'] = () => G('ADBE Vector Group', 'Group 1', [
	IG('ADBE Vectors Group', 'Contents', SHAPE_ITEMS),
	vectorTransform()
]);

const builtIn = () => G('ADBE Effect Built In Params', 'Compositing Options', [P('ADBE Effect Mask Opacity', 'Effect Opacity', VT.OneD, 100)]);
const EFFECTS = {
	'ADBE Glo2': () => G('ADBE Glo2', 'Glow', [
		P('ADBE Glo2-0001', 'Glow Threshold', VT.OneD, 60),
		P('ADBE Glo2-0002', 'Glow Radius', VT.OneD, 10),
		P('ADBE Glo2-0003', 'Glow Intensity', VT.OneD, 1),
		G('ADBE Effect Mask Parade', 'Masks', []),
		builtIn()
	]),
	'ADBE Fill': () => G('ADBE Fill', 'Fill', [
		P('ADBE Fill-0001', 'Fill Mask', VT.MASK_INDEX, 0),
		P('ADBE Fill-0002', 'Color', VT.COLOR, [1, 0, 0, 1]),
		P('ADBE Fill-0006', 'Opacity', VT.OneD, 1),
		builtIn()
	]),
	// parâmetros que apontam para uma layer (como Left View / Right View do 3D Glasses)
	'ADBE 3D Glasses2': () => G('ADBE 3D Glasses2', '3D Glasses', [
		P('ADBE 3D Glasses2-0001', 'Left View', VT.LAYER_INDEX, 0),
		P('ADBE 3D Glasses2-0002', 'Right View', VT.LAYER_INDEX, 0),
		builtIn()
	]),
	// pseudo effect (definido no PresetEffects.xml): um parâmetro de cada tipo, com um grupo
	'Pseudo/BIN Texto': () => G('Pseudo/BIN Texto', 'BIN Texto', [
		Object.assign(P('Pseudo/BIN Texto-0001', 'Tamanho', VT.OneD, 72), { min: 0, max: 1000 }),
		Object.assign(P('Pseudo/BIN Texto-0002', 'Inclinação', VT.OneD, 0), { units: 'degrees' }),
		Object.assign(P('Pseudo/BIN Texto-0003', 'Caixa alta', VT.OneD, 0), { min: 0, max: 1 }),
		P('Pseudo/BIN Texto-0004', 'Cor', VT.COLOR, [1, 0.5, 0, 1]),
		P('Pseudo/BIN Texto-0005', 'Centro', VT.TwoD_SPATIAL, [960, 540]),
		Object.assign(P('Pseudo/BIN Texto-0006', 'Alinhamento', VT.OneD, 2), { min: 1, max: 3 }),
		P('Pseudo/BIN Texto-0007', 'Referência', VT.LAYER_INDEX, 0),
		P('Pseudo/BIN Texto-0008', 'Avançado', VT.NO_VALUE, null),
		Object.assign(P('Pseudo/BIN Texto-0009', 'Respiro', VT.OneD, 12.5), { min: -100, max: 100 }),
		P('Pseudo/BIN Texto-0010', '', VT.NO_VALUE, null),
		builtIn()
	]),
	'ADBE Slider Control': () => G('ADBE Slider Control', 'Slider Control', [P('ADBE Slider Control-0001', 'Slider', VT.OneD, 0), builtIn()])
};
const MASKS = {
	'ADBE Mask Atom': () => G('ADBE Mask Atom', 'Mask 1', [
		P('ADBE Mask Shape', 'Mask Path', VT.SHAPE, null),
		P('ADBE Mask Feather', 'Mask Feather', VT.TwoD, [0, 0]),
		P('ADBE Mask Opacity', 'Mask Opacity', VT.OneD, 100),
		P('ADBE Mask Offset', 'Mask Expansion', VT.OneD, 0)
	], { mask: true })
};
const ANIM_PROPS = {
	'ADBE Text Opacity': () => P('ADBE Text Opacity', 'Opacity', VT.OneD, 100),
	'ADBE Text Position 3D': () => P('ADBE Text Position 3D', 'Position', VT.ThreeD_SPATIAL, [0, 0, 0]),
	'ADBE Text Tracking Amount': () => P('ADBE Text Tracking Amount', 'Tracking Amount', VT.OneD, 0)
};
// eixos de fonte variável: listados como as outras, mas com fonte comum o AE nunca deixa adicioná-los
for (let i = 1; i <= 8; i++) ANIM_PROPS['ADBE Text VF Axis ' + i] = () => Object.assign(P('ADBE Text VF Axis ' + i, 'Axis ' + i, VT.OneD, 0), { fixed: true });
const SELECTORS = {
	'ADBE Text Selector': () => G('ADBE Text Selector', 'Range Selector 1', [
		P('ADBE Text Percent Start', 'Start', VT.OneD, 0),
		P('ADBE Text Percent End', 'End', VT.OneD, 100),
		P('ADBE Text Percent Offset', 'Offset', VT.OneD, 0)
	])
};
const ANIMATORS = {
	'ADBE Text Animator': () => G('ADBE Text Animator', 'Animator 1', [
		IG('ADBE Text Selectors', 'Selectors', SELECTORS),
		G('ADBE Text Animator Properties', 'Properties', [], { addableNamed: ANIM_PROPS })
	])
};

function transformSpec(comp, three) {
	return G('ADBE Transform Group', 'Transform', [
		P('ADBE Anchor Point', 'Anchor Point', VT.ThreeD_SPATIAL, [0, 0, 0]),
		P('ADBE Position', 'Position', VT.ThreeD_SPATIAL, [comp.width / 2, comp.height / 2, 0]),
		P('ADBE Position_0', 'X Position', VT.OneD, comp.width / 2),
		P('ADBE Position_1', 'Y Position', VT.OneD, comp.height / 2),
		P('ADBE Position_2', 'Z Position', VT.OneD, 0),
		P('ADBE Scale', 'Scale', VT.ThreeD, [100, 100, 100]),
		P('ADBE Orientation', 'Orientation', VT.ThreeD, [0, 0, 0]),
		P('ADBE Rotate X', 'X Rotation', VT.OneD, 0),
		P('ADBE Rotate Y', 'Y Rotation', VT.OneD, 0),
		P('ADBE Rotate Z', 'Rotation', VT.OneD, 0),
		P('ADBE Opacity', 'Opacity', VT.OneD, 100)
	]);
}

// ----------------------------------------------------------- propriedades --
class PropertyBase {
	// como no AE: acima dos grupos de primeiro nível está a própria layer
	get parentProperty() { return this._parent || this._layer || null; }
	get propertyIndex() { const up = this._parent || this._layer; return up ? up._kids.indexOf(this) + 1 : 0; }
	get propertyDepth() { let d = 0, p = this; while (p._parent) { d++; p = p._parent; } return d + (p._layer ? 1 : 0); }
	propertyGroup(n) { let p = this; for (let i = 0; i < (n === undefined ? 1 : n); i++) p = p.parentProperty; return p; }
	get name() { return this._name; }
	set name(v) {
		if (!this._parent || this._parent.propertyType !== PropertyType.INDEXED_GROUP) throw new Error('Unable to set name: property is not a member of an indexed group');
		this._name = v;
	}
	get selected() { return !!this._selected; }
	set selected(v) { this._selected = v; }
}

class Property extends PropertyBase {
	constructor(spec, parent) {
		super();
		this._parent = parent; this.matchName = spec.mn; this._name = spec.name; this.propertyValueType = spec.vt; this._spec = spec;
		this._def = spec.vt === VT.SHAPE ? new Shape() : spec.vt === VT.TEXT_DOCUMENT ? new TextDocument('') : spec.vt === VT.MARKER ? null : clone(spec.def);
		this._value = clone(this._def);
		this._keys = []; this._expr = ''; this.expressionEnabled = true; this._sep = false;
	}
	get propertyType() { return PropertyType.PROPERTY; }
	get value() { return clone(this._value); }
	// faixa válida, unidade e "é um popup" (como nos parâmetros de efeito do AE)
	get hasMin() { return this._spec.min !== undefined; }
	get hasMax() { return this._spec.max !== undefined; }
	get minValue() { if (this._spec.min === undefined) throw new Error('no min'); return this._spec.min; }
	get maxValue() { if (this._spec.max === undefined) throw new Error('no max'); return this._spec.max; }
	get unitsText() { return this._spec.units || ''; }
	get isDropdownEffect() { return !!this._spec.dropdown; }
	get numKeys() { return this._keys.length; }
	// essential graphics: a propriedade vira um controle da comp da layer dela
	canAddToMotionGraphicsTemplate(comp) {
		const owner = this.propertyGroup(this.propertyDepth);
		return comp instanceof CompItem && owner && owner.containingComp === comp && !comp._egp.some((e) => e.prop === this) && this.propertyValueType !== VT.NO_VALUE;
	}
	addToMotionGraphicsTemplateAs(comp, name) {
		if (!this.canAddToMotionGraphicsTemplate(comp)) throw new Error('After Effects error: Can not add property "' + this.name + '" to the Essential Graphics of this composition');
		comp._egp.push({ prop: this, name: name || this.name });
		return true;
	}
	addToMotionGraphicsTemplate(comp) { return this.addToMotionGraphicsTemplateAs(comp, this.name); }
	get isSpatial() { return this.propertyValueType === VT.TwoD_SPATIAL || this.propertyValueType === VT.ThreeD_SPATIAL; }
	get canSetExpression() { return true; }
	get canVaryOverTime() { return true; }
	get isModified() { return !eq(this._value, this._def) || this._keys.length > 0 || this._expr !== ''; }
	get expression() { return this._expr; }
	set expression(v) { this._expr = v; }
	get dimensionsSeparated() { return this._sep; }
	set dimensionsSeparated(v) {
		if (this.matchName !== 'ADBE Position') throw new Error('dimensionsSeparated: not a separation leader');
		this._sep = v;
	}
	_check(v) {
		const vt = this.propertyValueType;
		if (this._parent && this._parent.matchName === 'ADBE Transform Group') {
			const pos = this._parent.property('ADBE Position');
			if (this.matchName === 'ADBE Position' && pos._sep) throw new Error('Unable to set value: dimensions are separated');
			if (/^ADBE Position_\d$/.test(this.matchName) && !pos._sep) throw new Error('Unable to set value: property is hidden');
		}
		if (vt === VT.SHAPE && !(v instanceof Shape)) throw new Error('Unable to set value: expected Shape');
		if (vt === VT.TEXT_DOCUMENT && !(v instanceof TextDocument)) throw new Error('Unable to set value: expected TextDocument');
		if (vt === VT.MARKER && !(v instanceof MarkerValue)) throw new Error('Unable to set value: expected MarkerValue');
		const d = DIMS[vt];
		if (d === 1 && typeof v !== 'number') throw new Error('Unable to set value: expected number in ' + this.matchName);
		if (d > 1 && (!Array.isArray(v) || (v.length !== d && !(vt === VT.ThreeD_SPATIAL && v.length === 2) && !(vt === VT.COLOR && v.length === 3)))) throw new Error('Unable to set value: bad array in ' + this.matchName);
	}
	_norm(v) {
		if (this.propertyValueType === VT.ThreeD_SPATIAL && Array.isArray(v) && v.length === 2) return [v[0], v[1], 0];
		if (this.propertyValueType === VT.COLOR && Array.isArray(v) && v.length === 3) return [v[0], v[1], v[2], 1];
		return v;
	}
	setValue(v) {
		if (this._keys.length) throw new Error('Unable to call "setValue" because the property has keyframes');
		this._check(v);
		this._value = clone(this._norm(v));
	}
	_dims() { return this.isSpatial || this.propertyValueType === VT.SHAPE || this.propertyValueType === VT.TEXT_DOCUMENT || this.propertyValueType === VT.MARKER ? 1 : (DIMS[this.propertyValueType] || 1); }
	setValueAtTime(t, v) {
		this._check(v);
		v = clone(this._norm(v));
		let k = this._keys.find((x) => Math.abs(x.t - t) < 1e-6);
		if (!k) {
			const dflt = this.propertyValueType === VT.MARKER || this.propertyValueType === VT.TEXT_DOCUMENT ? 'H' : 'L';
			k = { t, i: dflt, o: dflt, ei: [], eo: [], tc: false, ta: false, sc: false, sa: false, rv: false, si: null, so: null };
			for (let d = 0; d < this._dims(); d++) { k.ei.push(new KeyframeEase(0, 16.666667)); k.eo.push(new KeyframeEase(0, 16.666667)); }
			if (this.isSpatial) { const n = DIMS[this.propertyValueType]; k.si = new Array(n).fill(0); k.so = new Array(n).fill(0); }
			this._keys.push(k);
			this._keys.sort((a, b) => a.t - b.t);
		}
		k.v = v;
		this._value = clone(this._keys[0].v);
	}
	_k(i) { if (i < 1 || i > this._keys.length) throw new Error('key index out of range'); return this._keys[i - 1]; }
	removeKey(i) { this._k(i); this._keys.splice(i - 1, 1); if (this._keys.length) this._value = clone(this._keys[0].v); }
	keyTime(i) { return this._k(i).t; }
	keyValue(i) { return clone(this._k(i).v); }
	nearestKeyIndex(t) {
		let best = 1, bd = Infinity;
		this._keys.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < bd) { bd = d; best = i + 1; } });
		return best;
	}
	_interp(c) { return { L: KeyframeInterpolationType.LINEAR, B: KeyframeInterpolationType.BEZIER, H: KeyframeInterpolationType.HOLD }[c]; }
	_code(v) { for (const c of 'LBH') if (this._interp(c) === v) return c; throw new Error('bad interpolation'); }
	keyInInterpolationType(i) { return this._interp(this._k(i).i); }
	keyOutInterpolationType(i) { return this._interp(this._k(i).o); }
	setInterpolationTypeAtKey(i, a, b) { const k = this._k(i); k.i = this._code(a); k.o = this._code(b === undefined ? a : b); }
	keyInTemporalEase(i) { return this._k(i).ei.map((e) => new KeyframeEase(e.speed, e.influence)); }
	keyOutTemporalEase(i) { return this._k(i).eo.map((e) => new KeyframeEase(e.speed, e.influence)); }
	setTemporalEaseAtKey(i, a, b) {
		const k = this._k(i);
		if (a.length !== this._dims()) throw new Error('bad ease dimension');
		a.concat(b || a).forEach((e) => { if (e.influence < 0.1 || e.influence > 100) throw new Error('influence out of range'); });
		k.ei = a.map((e) => new KeyframeEase(e.speed, e.influence)); k.eo = (b || a).map((e) => new KeyframeEase(e.speed, e.influence));
		k.ta = false;
	}
	keyTemporalContinuous(i) { return this._k(i).tc; }
	setTemporalContinuousAtKey(i, v) { this._k(i).tc = v; }
	keyTemporalAutoBezier(i) { return this._k(i).ta; }
	setTemporalAutoBezierAtKey(i, v) { this._k(i).ta = v; }
	_spatial() { if (!this.isSpatial) throw new Error('not spatial'); }
	keyInSpatialTangent(i) { this._spatial(); return this._k(i).si.slice(); }
	keyOutSpatialTangent(i) { this._spatial(); return this._k(i).so.slice(); }
	setSpatialTangentsAtKey(i, a, b) { this._spatial(); const k = this._k(i); k.si = a.slice(); k.so = (b || a).slice(); k.sa = false; }
	keySpatialContinuous(i) { this._spatial(); return this._k(i).sc; }
	setSpatialContinuousAtKey(i, v) { this._spatial(); this._k(i).sc = v; }
	keySpatialAutoBezier(i) { this._spatial(); return this._k(i).sa; }
	setSpatialAutoBezierAtKey(i, v) { this._spatial(); this._k(i).sa = v; }
	keyRoving(i) { return this._k(i).rv; }
	setRovingAtKey(i, v) {
		if (i === 1 || i === this._keys.length) throw new Error('first and last keys cannot rove');
		this._k(i).rv = v;
	}
}

class Group extends PropertyBase {
	constructor(spec, parent) {
		super();
		this._parent = parent; this.matchName = spec.mn; this._name = spec.name; this._spec = spec; this._enabled = true;
		this._kids = (spec.kids || []).map((k) => build(k, this));
		// como no AE: o grupo de propriedades de um animator lista todas as propriedades possíveis,
		// mesmo as que não foram adicionadas (elas ficam escondidas na timeline)
		if (spec.addableNamed) Object.keys(spec.addableNamed).forEach((mn) => { const p = build(spec.addableNamed[mn](), this); p._hidden = true; this._kids.push(p); });
		if (spec.mask) Object.assign(this, { maskMode: ENUMS.MaskMode.ADD, inverted: false, rotoBezier: false, maskMotionBlur: ENUMS.MaskMotionBlur.SAME_AS_LAYER, maskFeatherFalloff: ENUMS.MaskFeatherFalloff.FFO_SMOOTH, color: [0.6, 0.6, 1], locked: false });
	}
	get propertyType() { return this._spec.kind === 'indexed' ? PropertyType.INDEXED_GROUP : PropertyType.NAMED_GROUP; }
	get numProperties() { return this._kids.length; }
	get canSetEnabled() { return !!(this._parent && this._parent.propertyType === PropertyType.INDEXED_GROUP); }
	get enabled() { return this._enabled; }
	set enabled(v) { if (!this.canSetEnabled) throw new Error('cannot set enabled'); this._enabled = v; }
	get isModified() { return this._kids.some((k) => k.isModified); }
	property(n) {
		if (typeof n === 'number') return this._kids[n - 1] || null;
		return this._kids.find((k) => k.matchName === n || k._name === n) || null;
	}
	_addable() { return this._spec.addable || this._spec.addableNamed; }
	canAddProperty(mn) {
		const a = this._addable();
		if (!a || !a[mn]) return false;
		if (/^Pseudo\//.test(mn) && !ENV.pseudo && !ENV.registered[mn]) return false;
		if (this._spec.addableNamed) return !!(this.property(mn) && this.property(mn)._hidden && !a[mn]().fixed);
		return true;
	}
	addProperty(mn) {
		if (!this.canAddProperty(mn)) throw new Error('Unable to call "addProperty": can not add a property with this name: ' + mn);
		if (this._spec.addableNamed) { const h = this.property(mn); h._hidden = false; return h; }
		const spec = this._addable()[mn]();
		const p = build(spec, this);
		if (this._spec.kind === 'indexed') {
			const n = this._kids.filter((k) => k.matchName === mn).length + 1;
			p._name = spec.name.replace(/ 1$/, ' ' + n);
		}
		this._kids.push(p);
		return p;
	}
}
function build(spec, parent) {
	if (spec.kind === 'p') return new Property(spec, parent);
	return new Group(spec, parent);
}

// --------------------------------------------------------------- layers --
class Layer {
	constructor(comp, name) {
		this.containingComp = comp; this._name = name; this.label = 1; this.comment = ''; this.enabled = true; this.shy = false;
		this.locked = false; this.startTime = 0; this.stretch = 100; this.inPoint = 0; this.outPoint = comp.duration;
		this.autoOrient = ENUMS.AutoOrientType.NO_AUTO_ORIENT; this.parent = null; this.selected = false; this.nullLayer = false;
		this._kids = [];
		this._addGroup(P('ADBE Marker', 'Marker', VT.MARKER, null));
	}
	get name() { return this._name; }
	set name(v) { this._name = v; }
	get index() { return this.containingComp._layers.indexOf(this) + 1; }
	_addGroup(spec) { const g = build(spec, this); g._parent = null; g._layer = this; this._kids.push(g); return g; }
	get numProperties() { return this._kids.length; }
	property(n) {
		if (typeof n === 'number') return this._kids[n - 1] || null;
		return this._kids.find((k) => k.matchName === n || k._name === n) || null;
	}
	get selectedProperties() { return []; }
	setParentWithJump(p) { this.parent = p; }
}
class AVLayer extends Layer {
	constructor(comp, name, source) {
		super(comp, name);
		this.source = source || null; this.threeDLayer = false; this.motionBlur = false; this.adjustmentLayer = false; this.guideLayer = false;
		this.collapseTransformation = false; this.effectsActive = true; this.preserveTransparency = false; this.timeRemapEnabled = false;
		this.blendingMode = ENUMS.BlendingMode.NORMAL; this.quality = ENUMS.LayerQuality.BEST; this.samplingQuality = ENUMS.LayerSamplingQuality.BILINEAR;
		this.frameBlendingType = ENUMS.FrameBlendingType.NO_FRAME_BLEND; this.trackMatteType = ENUMS.TrackMatteType.NO_TRACK_MATTE;
		this.trackMatteLayer = null; this.hasAudio = false; this.audioEnabled = true;
		this._addGroup(P('ADBE Time Remapping', 'Time Remap', VT.OneD, 0));
		this._addGroup(transformSpec(comp));
		this._addGroup(G('ADBE Layer Styles', 'Layer Styles', []));
		this._addGroup(IG('ADBE Mask Parade', 'Masks', MASKS));
		this._addGroup(IG('ADBE Effect Parade', 'Effects', EFFECTS));
	}
	setTrackMatte(layer, type) { this.trackMatteLayer = layer; this.trackMatteType = type; }
	applyPreset(file) {
		const f = new file.constructor(file.fsName);
		if (!f.open('r')) throw new Error('applyPreset: arquivo não encontrado');
		const data = f.read(); f.close();
		const m = /^RIFX[\s\S]{4}FaFX[\s\S]*?(Pseudo\/[^\x00]+)/.exec(data);
		if (!m) throw new Error('applyPreset: não é um .ffx');
		ENV.registered[m[1]] = true;
		this.property('ADBE Effect Parade').addProperty(m[1]);
	}
	get width() { return this.source ? this.source.width : this.containingComp.width; }
	get height() { return this.source ? this.source.height : this.containingComp.height; }
	// Essential Properties: aparece quando a comp de origem tem controles no essential graphics
	property(n) {
		if (n === 'ADBE Layer Overrides' || n === 'Essential Properties') return this._overrides();
		return super.property(n);
	}
	_overrides() {
		const src = this.source;
		if (!(src instanceof CompItem) || !src._egp.length) return null;
		this._ov = this._ov || {};
		const layer = this;
		const leaves = src._egp.map((e) => new OverrideProperty(layer, e));
		return {
			matchName: 'ADBE Layer Overrides', name: 'Essential Properties', propertyType: PropertyType.NAMED_GROUP,
			numProperties: leaves.length, parentProperty: layer, propertyIndex: 0,
			property: (n) => (typeof n === 'number' ? leaves[n - 1] : leaves.find((l) => l.name === n)) || null
		};
	}
	// como no AE de verdade: shape e texto têm tudo de AVLayer, mas "instanceof AVLayer" dá false
	static [Symbol.hasInstance](o) {
		if (this !== AVLayer) return Function.prototype[Symbol.hasInstance].call(this, o);
		return !!o && Function.prototype[Symbol.hasInstance].call(AVLayer, o) && !(o instanceof ShapeLayer) && !(o instanceof TextLayer);
	}
}
class OverrideProperty {
	constructor(layer, e) { this._layer = layer; this._e = e; this.name = e.name; this.matchName = 'ADBE Layer Overrides Property'; layer._ovx = layer._ovx || {}; }
	// a expressão fica guardada na layer (o grupo é refeito a cada acesso)
	get expression() { return (this._layer._ovx[this.name] || {}).x || ''; }
	set expression(v) { this._layer._ovx[this.name] = { x: v, on: true }; }
	get expressionEnabled() { return (this._layer._ovx[this.name] || { on: true }).on; }
	set expressionEnabled(v) { (this._layer._ovx[this.name] = this._layer._ovx[this.name] || { x: '' }).on = v; }
	get propertyType() { return PropertyType.PROPERTY; }
	get propertyValueType() { return this._e.prop.propertyValueType; }
	get essentialPropertySource() { return this._e.prop; }
	get numKeys() { return 0; }
	get value() { const o = this._layer._ov[this.name]; return o !== undefined ? clone(o) : this._e.prop.value; }
	setValue(v) { this._e.prop._check(v); this._layer._ov[this.name] = clone(this._e.prop._norm(v)); }
}
class ShapeLayer extends AVLayer {
	constructor(comp) {
		super(comp, 'Shape Layer 1');
		this._kids.splice(2, 0, build(IG('ADBE Root Vectors Group', 'Contents', SHAPE_ITEMS), null));
		this._kids[2]._layer = this;
	}
}
class TextLayer extends AVLayer {
	constructor(comp, box) {
		super(comp, 'Text');
		// como no AE: texto é sempre rasterizado continuamente; o switch não pode ser alterado
		Object.defineProperty(this, 'collapseTransformation', {
			get: () => true,
			set: () => { throw new Error('After Effects error: Can not set collapseTransformation on Layer "' + this.name + '". Check layer.canSetCollapseTransformation before setting.'); }
		});
		this.canSetCollapseTransformation = false;
		const tp = build(G('ADBE Text Properties', 'Text', [
			P('ADBE Text Document', 'Source Text', VT.TEXT_DOCUMENT, null),
			IG('ADBE Text Animators', 'Animators', ANIMATORS)
		]), null);
		if (box) {
			const doc = new TextDocument('');
			doc.boxText = true; doc.pointText = false; doc.boxTextSize = box.slice();
			tp.property('ADBE Text Document')._def = doc.clone();
			tp.property('ADBE Text Document')._value = doc.clone();
		}
		this._kids.splice(2, 0, tp);
		tp._layer = this;
		this.threeDPerChar = false;
	}
}
class CameraLayer extends Layer {
	constructor(comp, name) {
		super(comp, name);
		this.autoOrient = ENUMS.AutoOrientType.CAMERA_OR_POINT_OF_INTEREST;
		this._addGroup(G('ADBE Transform Group', 'Transform', [
			P('ADBE Anchor Point', 'Point of Interest', VT.ThreeD_SPATIAL, [comp.width / 2, comp.height / 2, 0]),
			P('ADBE Position', 'Position', VT.ThreeD_SPATIAL, [comp.width / 2, comp.height / 2, -1777.7778]),
			P('ADBE Orientation', 'Orientation', VT.ThreeD, [0, 0, 0]),
			P('ADBE Rotate Z', 'Z Rotation', VT.OneD, 0)
		]));
		this._addGroup(G('ADBE Camera Options Group', 'Camera Options', [
			P('ADBE Camera Zoom', 'Zoom', VT.OneD, 1777.7778),
			P('ADBE Camera Depth of Field', 'Depth of Field', VT.OneD, 0)
		]));
	}
}
class LightLayer extends Layer {
	constructor(comp, name) {
		super(comp, name);
		this.lightType = ENUMS.LightType.SPOT;
		this._addGroup(transformSpec(comp));
		this._addGroup(G('ADBE Light Options Group', 'Light Options', [
			P('ADBE Light Intensity', 'Intensity', VT.OneD, 100),
			P('ADBE Light Color', 'Color', VT.COLOR, [1, 1, 1, 1])
		]));
	}
}

// --------------------------------------------------------------- projeto --
class SolidSource { constructor(color) { this.color = color; } }
class FileSource { constructor(file) { this.file = file; } }
let nextId = 1;
class Item { constructor(name) { this.name = name; this.id = nextId++; this.selected = false; this.comment = ''; this.label = 0; } }
class FootageItem extends Item {
	constructor(name, w, h, main) { super(name); this.width = w; this.height = h; this.pixelAspect = 1; this.duration = 0; this.mainSource = main; }
}
class CompItem extends Item {
	constructor(project, name, w, h, pa, dur, fps) {
		super(name); this._project = project; this.width = w; this.height = h; this.pixelAspect = pa; this.duration = dur; this.frameRate = fps;
		this.bgColor = [0, 0, 0]; this._layers = [];
		this.displayStartTime = 0; this.workAreaStart = 0; this.workAreaDuration = dur; this.motionBlur = false; this.frameBlending = false;
		this.hideShyLayers = false; this.draft3d = false; this.shutterAngle = 180; this.shutterPhase = -90; this.motionBlurSamplesPerFrame = 16;
		this.motionBlurAdaptiveSampleLimit = 128; this.preserveNestedFrameRate = false; this.preserveNestedResolution = false;
		this.resolutionFactor = [1, 1]; this.renderer = 'ADBE Advanced 3d'; this.comment = ''; this.label = 15;
		this.markerProperty = new Property(P('ADBE Marker', 'Marker', VT.MARKER, null), null);
		this._egp = []; this.motionGraphicsTemplateName = '';
		const self = this;
		this.layers = {
			_push(l) { self._layers.unshift(l); l.selected = false; return l; },
			addShape() { return this._push(new ShapeLayer(self)); },
			addText(t) { const l = new TextLayer(self); if (t) l.property('ADBE Text Properties').property('ADBE Text Document')._value.text = t; return this._push(l); },
			addBoxText(size) { return this._push(new TextLayer(self, size)); },
			addSolid(color, name, w, h, pa) {
				if (!Array.isArray(color) || color.length !== 3) throw new Error('addSolid: color must be [r,g,b]');
				const src = project._addFootage(new FootageItem(name, w, h, new SolidSource(color)));
				src.pixelAspect = pa;
				return this._push(new AVLayer(self, name, src));
			},
			addNull() {
				const src = project._addFootage(new FootageItem('Null 1', 100, 100, new SolidSource([1, 1, 1])));
				const l = new AVLayer(self, 'Null 1', src); l.nullLayer = true; return this._push(l);
			},
			addCamera(name) { return this._push(new CameraLayer(self, name)); },
			addLight(name) { return this._push(new LightLayer(self, name)); },
			add(item) { return this._push(new AVLayer(self, item.name, item)); }
		};
	}
	get numLayers() { return this._layers.length; }
	layer(i) { if (typeof i === 'string') return this._layers.find((l) => l.name === i) || null; return this._layers[i - 1] || null; }
	get selectedLayers() { return this._layers.filter((l) => l.selected); }
	openInViewer() { this._project.activeItem = this; }
	get motionGraphicsTemplateControllerCount() { return this._egp.length; }
	getMotionGraphicsTemplateControllerName(i) { return this._egp[i - 1] ? this._egp[i - 1].name : null; }
	get usedIn() { return this._project._items.filter((c) => c instanceof CompItem && c._layers.some((l) => l.source === this)); }
	remove() { const i = this._project._items.indexOf(this); if (i >= 0) this._project._items.splice(i, 1); }
}
class Project {
	constructor() {
		this._items = []; this.activeItem = null;
		const self = this;
		this.items = { addComp(name, w, h, pa, dur, fps) { const c = new CompItem(self, name, w, h, pa, dur, fps); self._items.push(c); return c; } };
		this.rootFolder = {};
	}
	_addFootage(f) { this._items.push(f); return f; }
	get numItems() { return this._items.length; }
	item(i) { return this._items[i - 1]; }
	importFile() { throw new Error('import not supported in mock'); }
}

// ------------------------------------------------------------- contexto --
// sistema de arquivos em memória (File / Folder do ExtendScript), com a pasta de presets do usuário
function makeFS(project) {
	const files = new Map(), dirs = new Set();
	const DOCS = '/Users/teste/Documents', PRESETS = DOCS + '/Adobe/After Effects 2026/User Presets';
	const base = (p) => String(p).replace(/\/+$/, '').replace(/^.*\//, '');
	const mkdirs = (p) => { let d = String(p); while (d && d !== '/') { dirs.add(d); d = d.replace(/\/[^/]*$/, ''); } };
	[DOCS, PRESETS, '/tmp/ae'].forEach(mkdirs);
	class File {
		constructor(p) { this.fsName = String(p); this.encoding = 'UTF-8'; this._buf = null; this._mode = null; }
		get name() { return base(this.fsName); }
		get exists() { return files.has(this.fsName); }
		get modified() { const f = files.get(this.fsName); return f ? new Date(f.t) : null; }
		get length() { const f = files.get(this.fsName); return f ? f.data.length : -1; }
		open(mode) { this._mode = mode; if (mode === 'w') { this._buf = ''; return true; } const f = files.get(this.fsName); this._buf = f ? f.data : ''; return !!f; }
		write(t) { this._buf += String(t); return true; }
		read() { return this._buf; }
		close() { if (this._mode === 'w') { mkdirs(this.fsName.replace(/\/[^/]*$/, '')); files.set(this.fsName, { data: this._buf, t: Date.now() }); } this._mode = null; return true; }
		remove() { return files.delete(this.fsName); }
	}
	class Folder {
		constructor(p) { this.fsName = String(p).replace(/\/+$/, ''); }
		get name() { return base(this.fsName); }
		get exists() { return dirs.has(this.fsName); }
		create() { mkdirs(this.fsName); return true; }
		getFiles() {
			const out = [], pre = this.fsName + '/';
			dirs.forEach((d) => { if (d.startsWith(pre) && d.slice(pre.length).indexOf('/') < 0) out.push(new Folder(d)); });
			files.forEach((f, p) => { if (p.startsWith(pre) && p.slice(pre.length).indexOf('/') < 0) out.push(new File(p)); });
			return out;
		}
	}
	Folder.temp = new Folder('/tmp/ae');
	Folder.myDocuments = new Folder(DOCS);
	return { File, Folder, files, PRESETS };
}

// "Save Animation Preset...": o diálogo de salvar do AE é simulado por fs.dialog (pasta e nome, ou null = cancelar).
// O .ffx gravado leva o matchName do pseudo effect selecionado, como o arquivo real.
const SAVE_PRESET = 3075;
function savePreset(project, fs) {
	const comp = project.activeItem;
	let fx = null;
	if (comp) comp._layers.forEach((l) => { const g = l.property('ADBE Effect Parade'); for (let i = 1; g && i <= g.numProperties; i++) if (g.property(i).selected) fx = g.property(i); });
	if (!fx) throw new Error('Save Animation Preset: nada selecionado');
	const pick = fs.dialog === undefined ? { dir: fs.PRESETS, name: fx.name + '.ffx' } : fs.dialog;
	if (!pick) return; // cancelou
	const f = new fs.File(pick.dir + '/' + pick.name);
	f.encoding = 'BINARY'; f.open('w'); f.write('RIFX\x00\x00\x10\x00FaFXLIST' + fx.matchName + '\x00\xff\xfe binário'); f.close();
}

function createContext() {
	const project = new Project();
	const alerts = [];
	const fs2 = makeFS(project);
	ENV.registered = {};
	const ctx = {
		__env: ENV,
		PropertyType, PropertyValueType, KeyframeInterpolationType, Shape, TextDocument, KeyframeEase, MarkerValue,
		Layer, AVLayer, ShapeLayer, TextLayer, CameraLayer, LightLayer, CompItem, FootageItem, SolidSource, FileSource,
		app: {
			project, version: '24.6.0x1', beginUndoGroup() { }, endUndoGroup() { },
			findMenuCommandId: (n) => (n === 'Save Animation Preset...' ? SAVE_PRESET : 0),
			executeCommand(id) { if (id === SAVE_PRESET) savePreset(project, fs2); }
		},
		alert: (m) => alerts.push(m),
		File: fs2.File, Folder: fs2.Folder, __fs: fs2,
		ImportOptions: class { },
		console
	};
	Object.assign(ctx, ENUMS);
	ctx.$ = { global: ctx, os: 'Windows' };
	vm.createContext(ctx);
	ctx.__alerts = alerts;
	ctx.$.global = vm.runInContext('this', ctx);
	return ctx;
}

function loadHost(ctx, hostPath) {
	vm.runInContext(fs.readFileSync(hostPath, 'utf8'), ctx, { filename: 'host.jsx' });
}

module.exports = { createContext, loadHost, ENUMS };
