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
	get parentProperty() { return this._parent; }
	get propertyIndex() { return this._parent ? this._parent._kids.indexOf(this) + 1 : 0; }
	get propertyDepth() { let d = 0, p = this; while (p._parent) { d++; p = p._parent; } return d; }
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
		this._parent = parent; this.matchName = spec.mn; this._name = spec.name; this.propertyValueType = spec.vt;
		this._def = spec.vt === VT.SHAPE ? new Shape() : spec.vt === VT.TEXT_DOCUMENT ? new TextDocument('') : spec.vt === VT.MARKER ? null : clone(spec.def);
		this._value = clone(this._def);
		this._keys = []; this._expr = ''; this.expressionEnabled = true; this._sep = false;
	}
	get propertyType() { return PropertyType.PROPERTY; }
	get value() { return clone(this._value); }
	get numKeys() { return this._keys.length; }
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
		if (this._spec.addableNamed) return !this.property(mn);
		return true;
	}
	addProperty(mn) {
		if (!this.canAddProperty(mn)) throw new Error('Unable to call "addProperty": can not add a property with this name: ' + mn);
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
}
class ShapeLayer extends AVLayer {
	constructor(comp) {
		super(comp, 'Shape Layer 1');
		this._kids.splice(2, 0, build(IG('ADBE Root Vectors Group', 'Contents', SHAPE_ITEMS), null));
	}
}
class TextLayer extends AVLayer {
	constructor(comp, box) {
		super(comp, 'Text');
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
class Item { constructor(name) { this.name = name; this.id = nextId++; this.selected = false; } }
class FootageItem extends Item {
	constructor(name, w, h, main) { super(name); this.width = w; this.height = h; this.pixelAspect = 1; this.duration = 0; this.mainSource = main; }
}
class CompItem extends Item {
	constructor(project, name, w, h, pa, dur, fps) {
		super(name); this._project = project; this.width = w; this.height = h; this.pixelAspect = pa; this.duration = dur; this.frameRate = fps;
		this.bgColor = [0, 0, 0]; this._layers = [];
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
function createContext() {
	const project = new Project();
	const alerts = [];
	const ctx = {
		PropertyType, PropertyValueType, KeyframeInterpolationType, Shape, TextDocument, KeyframeEase, MarkerValue,
		Layer, AVLayer, ShapeLayer, TextLayer, CameraLayer, LightLayer, CompItem, FootageItem, SolidSource, FileSource,
		app: { project, version: '24.6.0x1', beginUndoGroup() { }, endUndoGroup() { }, executeCommand() { } },
		alert: (m) => alerts.push(m),
		File: class { constructor(p) { this.fsName = p; this.exists = false; } },
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
