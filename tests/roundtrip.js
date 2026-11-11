// Teste de ida e volta: monta uma comp no mock do After Effects, captura com o host.jsx,
// gera o script com o codegen, executa o script e captura de novo. As capturas precisam bater.
//  - layers: as layers selecionadas, recriadas em uma comp nova;
//  - comp: a comp inteira com as precomps aninhadas.
// uso: node tests/roundtrip.js [pasta de saída]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createContext, loadHost } = require('./ae_mock');
const CG = require('../bin-cep/js/codegen.js');
const scene = require('./scene');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });
const NOW = new Date(2026, 10, 7, 14, 30);

let failed = false;
const report = (ok, label, extra) => {
	console.log((ok ? 'ok    ' : 'FALHA ') + label + (extra ? ' · ' + extra : ''));
	if (!ok) failed = true;
};

function setup() {
	const ctx = createContext();
	loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
	const comp = scene(ctx);
	return { ctx, comp };
}

function call(ctx, fn) {
	const res = JSON.parse(ctx[fn]());
	if (res.error) throw new Error(fn + ': ' + res.error);
	return res;
}

function diff(a, b, p, out) {
	if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a && !b) || (!a && b)) { out.push(p + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); return out; }
	if (a && typeof a === 'object') {
		new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => diff(a[k], b[k], p + '.' + k, out));
	} else if (typeof a === 'number') {
		if (Math.abs(a - b) > 1e-3) out.push(p + ': ' + a + ' ≠ ' + b);
	} else if (a !== b) out.push(p + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
	return out;
}

// tira o que muda naturalmente entre o original e a cópia (ids de item do projeto)
function strip(raw) {
	const c = JSON.parse(JSON.stringify(raw));
	const layers = (list) => list.forEach((L) => { if (L.source) delete L.source.id; });
	if (c.comps) c.comps.forEach((C) => { delete C.id; layers(C.layers); });
	else { delete c.comp.id; layers(c.layers); }
	delete c.root;
	return c;
}

function run(ctx, code, label) {
	fs.writeFileSync(path.join(outDir, label + '.jsx'), code);
	// o ExtendScript é ES3: nada de let/const/arrow/template no script gerado
	if (/\b(let|const)\s|=>|`/.test(code)) throw new Error('código gerado usa sintaxe moderna');
	ctx.$.global.BIN_PANEL = true;
	ctx.$.global.BIN_LAST = null;
	vm.runInContext(code, ctx, { filename: label + '.jsx' });
	const last = ctx.$.global.BIN_LAST;
	if (!last || !last.ok) throw new Error('o script não terminou');
	return last;
}

// --------------------------------------------- shape e texto como AVLayer
// no AE, "layer instanceof AVLayer" é false para shape e texto; os atributos de AVLayer precisam vir mesmo assim
{
	const { ctx, comp } = setup();
	const adjShape = comp.layers.addShape();
	adjShape.name = 'AJUSTE_shape';
	adjShape.adjustmentLayer = true;
	adjShape.guideLayer = true;
	comp._layers.forEach((l) => { l.selected = ['TITULO_principal', 'CRÉDITO direção', 'AJUSTE_shape', 'MATTE'].indexOf(l.name) >= 0; });
	const cap = call(ctx, 'bin_capture');
	const by = (n) => cap.layers.find((L) => L.name === n);
	const capOk = by('AJUSTE_shape').attrs.adjustmentLayer === true && by('CRÉDITO direção').attrs.threeDLayer === true &&
		by('TITULO_principal').attrs.motionBlur === true && /ADD/.test(JSON.stringify(by('TITULO_principal').attrs.blendingMode)) && !!by('TITULO_principal').matte;
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target: 'new', now: NOW });
	run(ctx, code, 'avlayer-attrs');
	const made = (n) => ctx.app.project.activeItem._layers.find((l) => l.name === n);
	const madeOk = made('AJUSTE_shape').adjustmentLayer === true && made('AJUSTE_shape').guideLayer === true && made('CRÉDITO direção').threeDLayer === true &&
		made('TITULO_principal').motionBlur === true && made('TITULO_principal').blendingMode === ctx.BlendingMode.ADD && !!made('TITULO_principal').trackMatteLayer;
	report(capOk && madeOk, '[shape e texto] adjustment, guide, 3D, motion blur, blending e track matte capturados e recriados', 'captura ' + (capOk ? 'ok' : 'falhou') + ' · recriada ' + (madeOk ? 'ok' : 'falhou'));
}

// -------------------------------------------- animator de texto: só o que foi adicionado
// no AE o grupo de propriedades do animator lista todas as ~30 possíveis; só as adicionadas podem ser recriadas
{
	const { ctx, comp } = setup();
	const t = comp.layers.addText();
	t.name = 'txt_LOSANGO';
	const an = t.property('ADBE Text Properties').property('ADBE Text Animators').addProperty('ADBE Text Animator');
	an.name = 'pos X';
	const pos = an.property('ADBE Text Animator Properties').addProperty('ADBE Text Position 3D');
	pos.setValue([-2650, 0, 0]);
	pos.expression = '[-thisComp.width, 0]';
	comp._layers.forEach((l) => { l.selected = l === t; });
	const cap = call(ctx, 'bin_capture');
	const props = (layer) => layer.property('ADBE Text Properties').property('ADBE Text Animators').property(1).property('ADBE Text Animator Properties');
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target: 'new', now: NOW });
	run(ctx, code, 'animator-props');
	const made = ctx.app.project.activeItem._layers.find((l) => l.name === 'txt_LOSANGO');
	const shown = props(made)._kids.filter((k) => !k._hidden);
	const p2 = props(made).property('ADBE Text Position 3D');
	report(shown.length === 1 && shown[0].matchName === 'ADBE Text Position 3D' && p2.value[0] === -2650 && p2.expression === '[-thisComp.width, 0]',
		'[animator] recria só as propriedades adicionadas (com valor e expressão)', shown.map((k) => k.name).join(', '));
}

// -------------------------------------- efeitos que apontam para layers (3D Glasses)
// o valor é o número da layer: na comp recriada as posições mudam, então o script resolve pelo nome e pela posição original
[['active', 'layers'], ['new', 'layers'], ['new', 'comp']].forEach(([target, mode]) => {
	const { ctx, comp } = setup();
	const adj = comp._layers.find((l) => l.name === 'CONTROLE');
	const glasses = adj.property('ADBE Effect Parade').addProperty('ADBE 3D Glasses2');
	glasses.property('ADBE 3D Glasses2-0001').setValue(adj.index);                                               // ela mesma
	glasses.property('ADBE 3D Glasses2-0002').setValue(comp._layers.find((l) => l.name === 'MATTE').index);      // outra layer
	adj.property('ADBE Effect Parade').addProperty('ADBE Glo2'); // outro efeito depois: referências antigas a propriedades se perdem no AE
	const origMatte = comp._layers.find((l) => l.name === 'MATTE');
	comp._layers.forEach((l) => { l.selected = ['CONTROLE', 'MATTE'].indexOf(l.name) >= 0; });
	const cap = call(ctx, mode === 'comp' ? 'bin_captureComp' : 'bin_capture');
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target, now: NOW });
	const last = run(ctx, code, 'layer-ref-' + target + '-' + mode);
	const into = mode === 'comp' || target === 'new' ? ctx.app.project.activeItem : comp;
	const made = into._layers.find((l) => l !== adj && l.name === 'CONTROLE');
	const g = made && made.property('ADBE Effect Parade').property('ADBE 3D Glasses2');
	const left = g && into.layer(g.property('ADBE 3D Glasses2-0001').value);
	const right = g && into.layer(g.property('ADBE 3D Glasses2-0002').value);
	const ok = !last.errors.length && left === made && !!right && right.name === 'MATTE' && right !== origMatte;
	report(ok, '[3D Glasses · ' + mode + ' · ' + target + '] Left/Right View apontam para as layers recriadas', 'left ' + (left && left.name) + ' #' + (left && left.index) + ' · right ' + (right && right.name) + ' #' + (right && right.index) + ' · erros ' + last.errors.length);
});

// ------------------------------- expressões só no fim, com todas as layers e comps prontas
// (aplicadas antes, uma expressão que lê outra layer dá erro, e o expression selector não se recupera)
['layers', 'comp'].forEach((mode) => {
	const { ctx, comp } = setup();
	const proto = Object.getPrototypeOf(comp.layer(1).property('ADBE Transform Group').property('ADBE Opacity'));
	const desc = Object.getOwnPropertyDescriptor(proto, 'expression');
	const seen = [];
	Object.defineProperty(proto, 'expression', {
		configurable: true, get: desc.get,
		set(v) { const c = this.propertyGroup(this.propertyDepth).containingComp; seen.push({ comp: c, layers: c.numLayers, items: ctx.app.project.numItems }); desc.set.call(this, v); }
	});
	comp._layers.forEach((l) => { l.selected = true; });
	const cap = call(ctx, mode === 'comp' ? 'bin_captureComp' : 'bin_capture');
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target: 'new', now: NOW });
	seen.length = 0;
	const last = run(ctx, code, 'expr-no-fim-' + mode);
	Object.defineProperty(proto, 'expression', desc);
	const items = ctx.app.project.numItems;
	const ok = seen.length > 0 && !last.errors.length && seen.every((x) => x.items === items && x.layers === x.comp.numLayers);
	report(ok, '[expressões no fim · ' + mode + '] aplicadas com todas as layers e comps já criadas', seen.length + ' expressões · ' + seen.map((x) => x.layers + '/' + x.items).join(' '));
});

// ---------------------------------------------------------- essential graphics
// controles do essential graphics (com nome, ordem e o nome do template) e os valores mudados nas
// essential properties das layers de precomp
function egpScene() {
	const { ctx, comp } = setup();
	const pre = ctx.app.project._items.find((i) => i.name === 'PRE logo');
	const circ = pre.layer('circulo');
	circ.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Ellipse Size').addToMotionGraphicsTemplateAs(pre, 'Tamanho');
	circ.property('ADBE Transform Group').property('ADBE Opacity').addToMotionGraphicsTemplateAs(pre, 'Opacidade');
	comp.layer('CONTROLE').property('ADBE Effect Parade').property('amp').property('ADBE Slider Control-0001').addToMotionGraphicsTemplateAs(comp, 'Amplitude');
	comp.layer('CRÉDITO direção').property('ADBE Text Properties').property('ADBE Text Document').addToMotionGraphicsTemplateAs(comp, 'Crédito');
	comp.motionGraphicsTemplateName = 'Abertura v03';
	comp.layer('PRE logo').property('ADBE Layer Overrides').property('Tamanho').setValue([500, 500]);
	return { ctx, comp, pre };
}
{
	const { ctx, comp } = egpScene();
	const items = ctx.app.project.numItems;
	const cap = call(ctx, 'bin_captureComp');
	const root = cap.comps.find((C) => C.id === cap.root), preC = cap.comps.find((C) => C.name === 'PRE logo');
	const capOk = ctx.app.project.numItems === items && root.egp.map((e) => e.name).join() === 'Amplitude,Crédito' && root.mgtName === 'Abertura v03' &&
		preC.egp.map((e) => e.name).join() === 'Tamanho,Opacidade' && root.layers.find((L) => L.name === 'PRE logo').overrides.length === 1;
	report(capOk, '[essential graphics · captura] controles das duas comps, nome do template e o valor mudado na precomp', 'itens no projeto ' + items + ' → ' + ctx.app.project.numItems + ' (a comp temporária some)');

	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target: 'new', now: NOW });
	const last = run(ctx, code, 'egp-comp');
	const nr = ctx.app.project.activeItem;
	const np = nr._layers.find((l) => l.name === 'PRE logo').source;
	const owner = (e) => e.prop.propertyGroup(e.prop.propertyDepth);
	const made = nr !== comp && nr._egp.map((e) => e.name).join() === 'Amplitude,Crédito' && nr._egp.every((e) => owner(e).containingComp === nr) &&
		owner(nr._egp[0]).name === 'CONTROLE' && nr._egp[1].prop.matchName === 'ADBE Text Document' && nr.motionGraphicsTemplateName === 'Abertura v03' &&
		np !== ctx.app.project._items.find((i) => i.name === 'PRE logo') && np._egp.map((e) => e.name).join() === 'Tamanho,Opacidade' && owner(np._egp[0]).name === 'circulo';
	const ov = nr._layers.find((l) => l.name === 'PRE logo').property('ADBE Layer Overrides').property('Tamanho').value;
	report(made && ov[0] === 500 && !last.errors.length, '[essential graphics · comp] controles recriados nas comps novas, na ordem, e o valor da precomp', 'erros ' + last.errors.length + (last.errors.length ? ': ' + last.errors.join(' | ') : '') + ' · Tamanho ' + ov);

	// excluir no painel: o card inteiro ou um controle
	const m = CG.prepare(JSON.parse(JSON.stringify(cap)));
	const R = m.rootComp;
	const sem = CG.generate(m, { target: 'new', now: NOW, excluded: { [R.egp[1].id]: true } });
	const nada = CG.generate(m, { target: 'new', now: NOW, excluded: { [R.egpId]: true } });
	report(/'Amplitude'/.test(sem) && !/'Crédito'/.test(sem) && !/'Amplitude'/.test(nada) && /'Tamanho'/.test(nada), '[essential graphics · exclusões] um controle ou o card inteiro');
}
{
	// expressão numa essential property: entra mesmo com o valor igual ao de dentro da precomp, e no fim do script
	const { ctx, comp } = egpScene();
	const pl = comp.layer('PRE logo');
	pl.property('ADBE Layer Overrides').property('Opacidade').expression = 'thisComp.layer("CONTROLE").effect("amp")(1) * 10';
	pl.property('ADBE Layer Overrides').property('Tamanho').expression = '[100, 100]';
	pl.property('ADBE Layer Overrides').property('Tamanho').expressionEnabled = false;
	const cap = call(ctx, 'bin_captureComp');
	const ovs = cap.comps.find((C) => C.id === cap.root).layers.find((L) => L.name === 'PRE logo').overrides;
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target: 'new', now: NOW });
	const last = run(ctx, code, 'egp-expr');
	const g = ctx.app.project.activeItem._layers.find((l) => l.name === 'PRE logo').property('ADBE Layer Overrides');
	const op = g.property('Opacidade'), tp = g.property('Tamanho');
	report(ovs.length === 2 && op.expression === 'thisComp.layer("CONTROLE").effect("amp")(1) * 10' && op.expressionEnabled && tp.expression === '[100, 100]' && !tp.expressionEnabled && tp.value[0] === 500 && !last.errors.length,
		'[essential graphics · expressões] expressão na essential property recriada (inclusive desligada), com o valor', 'capturadas ' + ovs.length + ' · erros ' + last.errors.length + (last.errors.length ? ': ' + last.errors.join(' | ') : ''));
}
{
	// valor padrão de transform (escala 100%, opacidade 100%) não entra só porque o AE marcou como mexido
	const { ctx, comp } = setup();
	const sh = comp.layer('MATTE');
	const tg = sh.property('ADBE Transform Group');
	tg.property('ADBE Scale').setValue([100, 100, 100]);
	tg.property('ADBE Opacity').setValue(100);
	tg.property('ADBE Rotate Z').setValue(15);
	['ADBE Scale', 'ADBE Opacity'].forEach((mn) => Object.defineProperty(tg.property(mn), 'isModified', { get: () => true })); // como no AE depois de mexer e voltar
	comp._layers.forEach((l) => { l.selected = l === sh; });
	const L = call(ctx, 'bin_capture').layers[0];
	const tr = L.groups.find((n) => n.mn === 'ADBE Transform Group');
	const names = tr ? tr.kids.map((n) => n.mn) : [];
	report(names.indexOf('ADBE Scale') < 0 && names.indexOf('ADBE Opacity') < 0 && names.indexOf('ADBE Rotate Z') >= 0, '[padrões] escala 100% e opacidade 100% sem keys nem expressão ficam de fora (a rotação mudada fica)', names.join(', '));

	// com expressão ou keys, o valor padrão continua
	tg.property('ADBE Opacity').expression = 'value';
	const L2 = call(ctx, 'bin_capture').layers[0];
	const names2 = L2.groups.find((n) => n.mn === 'ADBE Transform Group').kids.map((n) => n.mn);
	report(names2.indexOf('ADBE Opacity') >= 0, '[padrões] opacidade 100% com expressão continua no script');
}
{
	// modo layers: a layer de precomp recriada na comp ativa leva o valor mudado (a precomp é a mesma do projeto)
	const { ctx, comp } = egpScene();
	const orig = comp.layer('PRE logo');
	comp._layers.forEach((l) => { l.selected = l === orig; });
	const cap = call(ctx, 'bin_capture');
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(cap))), { target: 'active', now: NOW });
	const last = run(ctx, code, 'egp-layers');
	const copy = comp._layers[0];
	const ov = copy.name === 'PRE logo' && copy !== orig ? copy.property('ADBE Layer Overrides').property('Tamanho').value : null;
	report(!!ov && ov[0] === 500 && !last.errors.length && !cap.comp.egp.length, '[essential graphics · layers] a layer de precomp recriada leva o valor mudado', 'Tamanho ' + ov + ' · erros ' + last.errors.length);
}

// ------------------------------------------------------------ pseudo effects
// o .ffx salvo pelo próprio AE (Save Animation Preset) entra no script e registra o efeito onde ele não existe
function pseudoScene() {
	const { ctx, comp } = setup();
	const l = comp.layer('CONTROLE');
	const fx = l.property('ADBE Effect Parade').addProperty('Pseudo/BIN Texto');
	fx.property('Pseudo/BIN Texto-0001').setValue(96);
	fx.property('Pseudo/BIN Texto-0009').setValue(-20);
	l.outPoint = 7; // atributo aplicado depois dos efeitos: confirma que a layer foi até o fim
	comp._layers.forEach((x) => { x.selected = x === l; });
	return { ctx, comp, l, fxIndex: l.property('ADBE Effect Parade').numProperties };
}
const bytesOf = (ctx, p) => Uint8Array.from(ctx.__fs.files.get(p).data, (c) => c.charCodeAt(0));
{
	const { ctx, comp, l, fxIndex } = pseudoScene();
	const m = CG.prepare(call(ctx, 'bin_capture'));
	const list = CG.pseudoEffects(m);
	report(list.length === 1 && list[0].mn === 'Pseudo/BIN Texto' && list[0].at[0].layer === l.index && list[0].at[0].fx === fxIndex && list[0].at[0].comp === comp.id,
		'[pseudo effects] a captura diz onde está cada pseudo effect (comp, layer, posição)');

	// salvar o .ffx pelo AE: só o efeito selecionado, na pasta de presets do usuário
	const r = JSON.parse(ctx.bin_savePseudo(comp.id, l.index, fxIndex, 'Pseudo/BIN Texto'));
	const sel = l.property('ADBE Effect Parade').property(fxIndex).selected && l.selected && comp._layers.filter((x) => x.selected).length === 1;
	report(r.ok && /User Presets\/BIN Texto\.ffx$/.test(r.file) && sel, '[pseudo effects] salvar .ffx: seleciona só o efeito, abre o Save Animation Preset e acha o arquivo', r.file);
	const ffx = bytesOf(ctx, r.file);

	// script com o .ffx embutido, numa máquina sem o pseudo effect
	const code = CG.generate(m, { target: 'new', now: NOW, ffx: { 'Pseudo/BIN Texto': ffx } });
	ctx.__env.pseudo = false;
	const files = ctx.__fs.files.size;
	const last = run(ctx, code, 'pseudo-ffx');
	const made = ctx.app.project.activeItem.layer('CONTROLE');
	const nfx = made && made.property('ADBE Effect Parade').property('Pseudo/BIN Texto');
	report(/var FFX = \{/.test(code) && /bin\.pseudo\(effects, 'Pseudo\/BIN Texto', 'BIN Texto', FFX\['Pseudo\/BIN Texto'\]\)/.test(code) && !!nfx &&
		nfx.property('Pseudo/BIN Texto-0001').value === 96 && nfx.property('Pseudo/BIN Texto-0009').value === -20 && made.outPoint === 7 && !last.errors.length &&
		!ctx.app.project._items.some((i) => /registro do pseudo effect/.test(i.name)) && ctx.__fs.files.size === files,
		'[pseudo effects] sem o efeito instalado: o .ffx embutido o registra (comp e arquivo temporários somem) e os valores entram', 'erros ' + last.errors.length + (last.errors.length ? ': ' + last.errors.join(' | ') : '') + ' · registrado: ' + !!ctx.__env.registered['Pseudo/BIN Texto']);

	// sem .ffx: um erro claro e o resto da layer recriado
	ctx.__env.registered = {};
	const code2 = CG.generate(m, { target: 'new', now: NOW });
	const last2 = run(ctx, code2, 'pseudo-sem-ffx');
	const made2 = ctx.app.project.activeItem.layer('CONTROLE');
	report(!/var FFX/.test(code2) && last2.errors.length === 1 && /pseudo effect não instalado nesta máquina.*\.ffx/.test(last2.errors[0]) && made2.outPoint === 7 && !!made2.property('ADBE Effect Parade').property('amp'),
		'[pseudo effects] sem .ffx: um erro claro, e o resto da layer (até a saída) recriado', last2.errors.join(' | '));
	ctx.__env.pseudo = true;

	// diálogo cancelado ou salvo fora da pasta de presets: sem arquivo (o painel pede para escolher)
	ctx.__fs.dialog = null;
	const c1 = JSON.parse(ctx.bin_savePseudo(comp.id, l.index, fxIndex, 'Pseudo/BIN Texto'));
	ctx.__fs.dialog = { dir: '/Users/teste/Desktop', name: 'x.ffx' };
	const c2 = JSON.parse(ctx.bin_savePseudo(comp.id, l.index, fxIndex, 'Pseudo/BIN Texto'));
	const c3 = JSON.parse(ctx.bin_savePseudo(comp.id, l.index, 1, 'Pseudo/BIN Texto'));
	report(c1.ok && c1.file === null && c2.ok && c2.file === null && /não está mais nessa layer/.test(c3.error), '[pseudo effects] cancelado ou fora da pasta: sem arquivo; efeito que mudou de lugar: erro');
}

// ---------------------------------------------------------- layers ------
[['layers-funcoes', {}], ['layers-inline', { wrap: false, comments: false }]].forEach(([label, opts]) => {
	const { ctx, comp } = setup();
	comp._layers.forEach((l) => { l.selected = true; });
	const before = call(ctx, 'bin_capture');
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(before))), Object.assign({ target: 'new', now: NOW }, opts));
	const last = run(ctx, code, label);
	const newComp = ctx.app.project.activeItem;
	const after = call(ctx, 'bin_capture');
	const d = diff(strip(before), strip(after), 'cap', []);
	report(newComp !== comp && !last.errors.length && !d.length, `[${label}] ${last.layers.length} layers recriadas`, `${code.split('\n').length} linhas · ${last.errors.length} erro(s) · ${d.length} diferença(s)`);
	last.errors.forEach((e) => console.log('   erro:', e));
	d.slice(0, 20).forEach((e) => console.log('   ≠', e));
});

// ------------------------------------------------------------ comp ------
[['comp-funcoes', {}], ['comp-inline', { wrap: false }]].forEach(([label, opts]) => {
	const { ctx, comp } = setup();
	const before = call(ctx, 'bin_captureComp');
	const code = CG.generate(CG.prepare(JSON.parse(JSON.stringify(before))), Object.assign({ now: NOW }, opts));
	const n = ctx.app.project.numItems;
	const last = run(ctx, code, label);
	const newComp = ctx.app.project.activeItem;
	const after = call(ctx, 'bin_captureComp');
	const d = diff(strip(before), strip(after), 'cap', []);
	const created = ctx.app.project._items.slice(n).filter((i) => i.constructor.name === 'CompItem').length;
	const ok = newComp !== comp && created === before.comps.length && !last.errors.length && !d.length;
	report(ok, `[${label}] ${created} comps criadas (${before.comps.map((c) => c.name).join(' > ')})`, `${last.count} layers na principal · ${code.split('\n').length} linhas · ${last.errors.length} erro(s) · ${d.length} diferença(s)`);
	last.errors.forEach((e) => console.log('   erro:', e));
	d.slice(0, 20).forEach((e) => console.log('   ≠', e));
});

// precomp desmarcada: a layer passa a usar a comp que já existe no projeto
{
	const { ctx, comp } = setup();
	const m = CG.prepare(call(ctx, 'bin_captureComp'));
	const pre = m.comps.find((C) => C.name === 'PRE logo');
	const ex = {}; ex[pre.key] = true;
	const code = CG.generate(m, { excluded: ex });
	const n = ctx.app.project.numItems;
	const last = run(ctx, code, 'comp-sem-precomp');
	const created = ctx.app.project._items.slice(n).filter((i) => i.constructor.name === 'CompItem');
	const preLayer = ctx.app.project.activeItem._layers.find((l) => l.name === 'PRE logo');
	report(created.length === 1 && preLayer && preLayer.source === ctx.app.project._items.find((i) => i.name === 'PRE logo') && !last.errors.length,
		'[comp sem precomp] só a principal é criada e a precomp original é reaproveitada');
	void comp;
}

// --------------------------------------------------------- opções -------
{
	const { ctx, comp } = setup();
	comp._layers.forEach((l) => { l.selected = true; });
	const m = CG.prepare(call(ctx, 'bin_capture'));
	const code = CG.generate(m, { keys: false, expr: false });
	report(!/bin\.keys\(/.test(code) && !/bin\.expr\(/.test(code), '[sem keys/expr]');

	const C = m.comps[0];
	const shp = C.layers.find((L) => L.name === 'TITULO_principal');
	const glow = shp.groups.find((g) => g.mn === 'ADBE Effect Parade').kids.find((k) => k.mn === 'ADBE Glo2');
	const light = C.layers.find((L) => L.type === 'light');
	const ex = {}; ex[glow.id] = true; ex[light.id] = true; ex[shp.attrsId + '/parent'] = true;
	const code2 = CG.generate(m, { excluded: ex });
	report(!/ADBE Glo2/.test(code2) && !/addLight/.test(code2) && /ADBE Fill/.test(code2) && (code2.match(/bin\.parent\(/g) || []).length === 1, '[exclusões]');

	const s = CG.stats(m, { excluded: ex });
	report(s.layers === C.layers.length - 1 && s.comps === 1, '[contagem]', `${s.layers} layers · ${s.props} props · ${s.keys} keys · ${s.expr} expr`);
}

// os auxiliares do script gerado precisam ser ES3 puro
{
	const h = CG.helpers();
	report(!/\b(let|const)\s|=>|`/.test(h) && /^var bin = \{/m.test(h), '[auxiliares ES3]', h.split('\n').length + ' linhas');
}

// ------------------------------------------------------ utilitários -----
{
	const ex = CG.expressions([{ layer: 'TITULO', path: 'Transform › Rotation', name: 'Rotation', x: 'var a = "x";\nwiggle(2, a);' }]);
	const c = vm.createContext({});
	vm.runInContext(ex, c);
	report(c.expRotation === 'var a = "x";\nwiggle(2, a);', '[expressão → string]');

	const bytes = new Uint8Array(256);
	for (let i = 0; i < 256; i++) bytes[i] = i;
	const s = vm.runInNewContext(CG.binaryString(bytes));
	let ok = s.length === 256;
	for (let i = 0; i < 256 && ok; i++) if (s.charCodeAt(i) !== i) ok = false;
	report(ok, '[arquivo → binário]');
}

// ------------------------------------------- expressão → string: o que a seleção pega
{
	const { ctx, comp } = setup();
	const sh = comp.layer('TITULO_principal');
	const ex = () => { const r = JSON.parse(ctx.bin_expressions()); return r.error ? r.error : r.items.map((i) => i.path).join(' | '); };
	const tr = sh.property('ADBE Transform Group');
	sh.property('ADBE Effect Parade').property('ADBE Fill').property('ADBE Fill-0002').expression = '[1, 0, 0, 1]'; // expressão fora do transform
	comp._layers.forEach((l) => { l.selected = l === sh; });
	const all = ex(); // nada selecionado dentro da layer: todas as expressões dela
	tr.property('ADBE Rotate Z').selected = true;
	const one = ex();
	tr.property('ADBE Rotate Z').selected = false;
	tr.selected = true; // o grupo transform: as expressões de dentro dele, não as da layer inteira
	const grp = ex();
	tr.property('ADBE Opacity').selected = true; // grupo e uma propriedade dele: sem repetir
	const both = ex();
	report(/Rotation/.test(all) && /Color/.test(all) && one === 'Transform › Rotation' && /Rotation/.test(grp) && /Opacity/.test(grp) && !/Color/.test(grp) && grp.split(' | ').length === 2 && both === grp,
		'[expressão → string] propriedade, grupo (só o que está dentro) e sem repetir', 'tudo: ' + all + ' · grupo: ' + grp + ' · grupo + propriedade: ' + both);
}

process.exit(failed ? 1 : 0);
