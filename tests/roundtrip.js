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

process.exit(failed ? 1 : 0);
