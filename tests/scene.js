// Comp de exemplo usada nos testes: uma layer de cada tipo, com keyframes, expressões, efeitos, máscara, markers, parent e track matte.
'use strict';

function scene(ctx) {
	const { app, Shape, TextDocument, KeyframeEase, MarkerValue, BlendingMode, TrackMatteType, MaskMode, KeyframeInterpolationType: KI, ParagraphJustification, LightType } = ctx;
	const pre = app.project.items.addComp('PRE logo', 800, 800, 1, 5, 29.97);
	const comp = app.project.items.addComp('ABERTURA_v03', 1920, 1080, 1, 10, 29.97);
	comp.bgColor = [0.05, 0.05, 0.08];
	app.project.activeItem = comp;
	const L = comp.layers;

	// (de baixo para cima)
	const light = L.addLight('Luz', [960, 540]);
	light.lightType = LightType.POINT;
	light.property('ADBE Light Options Group').property('ADBE Light Intensity').setValue(150);

	const cam = L.addCamera('Camera 1', [960, 540]);
	cam.property('ADBE Camera Options Group').property('ADBE Camera Zoom').setValue(2400);

	const precomp = L.add(pre);
	precomp.property('ADBE Transform Group').property('ADBE Scale').setValue([50, 50, 100]);
	precomp.startTime = 1.5;

	const adj = L.addSolid([1, 1, 1], 'Adjustment Layer 1', 1920, 1080, 1);
	adj.name = 'CONTROLE';
	adj.adjustmentLayer = true;
	const slider = adj.property('ADBE Effect Parade').addProperty('ADBE Slider Control');
	slider.name = 'amp';
	slider.property('ADBE Slider Control-0001').setValue(3);

	// texto em caixa com animator
	const txt = L.addBoxText([800, 200]);
	const sText = txt.property('ADBE Text Properties').property('ADBE Text Document');
	const doc = sText.value;
	doc.text = 'Direção\rANA BEATRIZ "Bia" D\'Ávila';
	doc.font = 'Inter-Bold'; doc.fontSize = 72; doc.fillColor = [0.3, 0.62, 1]; doc.justification = ParagraphJustification.CENTER_JUSTIFY; doc.tracking = 50;
	sText.setValue(doc);
	txt.name = 'CRÉDITO direção';
	txt.threeDLayer = true;
	const anim = txt.property('ADBE Text Properties').property('ADBE Text Animators').addProperty('ADBE Text Animator');
	anim.name = 'Fade';
	anim.property('ADBE Text Animator Properties').addProperty('ADBE Text Opacity').setValue(0);
	const sel = anim.property('ADBE Text Selectors').addProperty('ADBE Text Selector');
	const end = sel.property('ADBE Text Percent End');
	end.setValueAtTime(0, 0); end.setValueAtTime(1, 100);
	end.setInterpolationTypeAtKey(1, KI.BEZIER, KI.BEZIER); end.setTemporalEaseAtKey(1, [new KeyframeEase(0, 75)], [new KeyframeEase(0, 75)]);

	// shape com tudo
	const shp = L.addShape();
	shp.name = 'TITULO_principal';
	const contents = shp.property('ADBE Root Vectors Group');
	const grp = contents.addProperty('ADBE Vector Group');
	grp.name = 'Barra';
	const rect = grp.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Rect');
	const size = rect.property('ADBE Vector Rect Size');
	size.setValueAtTime(0, [0, 120]); size.setValueAtTime(0.5338, [860, 120]);
	size.setInterpolationTypeAtKey(1, KI.BEZIER, KI.BEZIER);
	size.setTemporalEaseAtKey(1, [new KeyframeEase(0, 33), new KeyframeEase(0, 33)], [new KeyframeEase(0, 75), new KeyframeEase(0, 75)]);
	size.setInterpolationTypeAtKey(2, KI.BEZIER, KI.LINEAR);
	rect.property('ADBE Vector Rect Roundness').setValue(12);
	grp.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([0.298, 0.616, 1, 1]);
	grp.property('ADBE Vector Transform Group').property('ADBE Vector Position').setValue([10, -4]);
	const g2 = contents.addProperty('ADBE Vector Group');
	g2.name = 'Estrela (off)';
	g2.enabled = false;
	const pth = g2.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Group');
	const s = new Shape();
	s.vertices = [[0, -50], [40, 30], [-40, 30]]; s.inTangents = [[0, 0], [0, 0], [0, 0]]; s.outTangents = [[0, 0], [5.5, 2], [0, 0]]; s.closed = true;
	pth.property('ADBE Vector Shape').setValue(s);
	g2.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Stroke').property('ADBE Vector Stroke Width').setValue(6);

	const tr = shp.property('ADBE Transform Group');
	const pos = tr.property('ADBE Position');
	pos.setValueAtTime(0, [960, 620, 0]); pos.setValueAtTime(0.4, [960, 540, 0]); pos.setValueAtTime(5.6, [960, 460, 0]);
	pos.setInterpolationTypeAtKey(2, KI.BEZIER, KI.BEZIER);
	pos.setSpatialTangentsAtKey(2, [-20, 0, 0], [20, 0, 0]);
	pos.setSpatialContinuousAtKey(2, true);
	pos.setRovingAtKey(2, true);
	const scl = tr.property('ADBE Scale');
	scl.setValueAtTime(0, [100, 100, 100]); scl.setValueAtTime(2, [120, 120, 100]);
	scl.setInterpolationTypeAtKey(1, KI.HOLD, KI.HOLD);
	tr.property('ADBE Rotate Z').expression = 'var amp = thisComp.layer("CONTROLE").effect("amp")("Slider");\nwiggle(2, amp);';
	tr.property('ADBE Opacity').setValue(80);
	tr.property('ADBE Opacity').expression = 'value * 0.5';
	tr.property('ADBE Opacity').expressionEnabled = false;

	const glow = shp.property('ADBE Effect Parade').addProperty('ADBE Glo2');
	glow.property('ADBE Glo2-0002').setValue(42);
	const fill = shp.property('ADBE Effect Parade').addProperty('ADBE Fill');
	fill.property('ADBE Fill-0002').setValue([1, 1, 1, 1]);
	fill.enabled = false;
	const mask = shp.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
	mask.name = 'recorte';
	const ms = new Shape();
	ms.vertices = [[0, 0], [1920, 0], [1920, 1080], [0, 1080]]; ms.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]]; ms.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
	mask.property('ADBE Mask Shape').setValue(ms);
	mask.property('ADBE Mask Feather').setValue([12, 12]);
	mask.maskMode = MaskMode.SUBTRACT;
	mask.inverted = true;

	shp.blendingMode = BlendingMode.ADD;
	shp.motionBlur = true;
	shp.label = 9;
	shp.comment = 'versão "final" — não mexer';
	shp.inPoint = 0.5; shp.outPoint = 6.006;
	const mk = shp.property('ADBE Marker');
	const m1 = new MarkerValue('entra'); m1.label = 3; m1.duration = 0.5;
	const m2 = new MarkerValue('sai'); m2.setParameters({ fx: 'blur' }); m2.chapter = 'cap 2';
	mk.setValueAtTime(0, m1); mk.setValueAtTime(5.4, m2);

	const matte = L.addSolid([1, 0, 0], 'MATTE', 1920, 1080, 1);
	matte.property('ADBE Transform Group').property('ADBE Opacity').setValue(50);
	shp.setTrackMatte(matte, TrackMatteType.ALPHA);

	const ctrl = L.addNull();
	ctrl.name = 'CTRL_titulo';
	ctrl.label = 2;
	const cpos = ctrl.property('ADBE Transform Group').property('ADBE Position');
	cpos.dimensionsSeparated = true;
	ctrl.property('ADBE Transform Group').property('ADBE Position_0').setValue(900);
	ctrl.property('ADBE Transform Group').property('ADBE Position_1').setValueAtTime(0, 500);
	ctrl.property('ADBE Transform Group').property('ADBE Position_1').setValueAtTime(3, 560);
	ctrl.locked = true;

	shp.parent = ctrl;
	txt.parent = ctrl;
	return comp;
}

module.exports = scene;
