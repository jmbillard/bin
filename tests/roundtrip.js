// Teste de ida e volta: monta uma comp no mock do After Effects, captura as layers com o
// host.jsx, gera o script com o codegen, executa o script (em uma comp nova) e captura de novo.
// As duas capturas precisam ser idênticas.
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

function capture(ctx) {
	const res = JSON.parse(ctx.bin_capture());
	if (res.error) throw new Error('captura: ' + res.error);
	return res;
}

function diff(a, b, p, out) {
	if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a && !b) || (!a && b)) { out.push(p + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); return out; }
	if (a && typeof a === 'object') {
		const keys = new Set(Object.keys(a).concat(Object.keys(b)));
		keys.forEach((k) => diff(a[k], b[k], p + '.' + k, out));
	} else if (typeof a === 'number') {
		if (Math.abs(a - b) > 1e-3) out.push(p + ': ' + a + ' ≠ ' + b);
	} else if (a !== b) out.push(p + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
	return out;
}

function run(opts, label) {
	const ctx = createContext();
	loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
	const comp = scene(ctx);
	comp._layers.forEach((l) => { l.selected = true; });
	const before = capture(ctx);
	fs.writeFileSync(path.join(outDir, label + '-captura.json'), JSON.stringify(before, null, 1));

	CG.prepare(before);
	const code = CG.generate(before, Object.assign({ target: 'new', now: new Date(2026, 10, 7, 14, 30) }, opts));
	fs.writeFileSync(path.join(outDir, label + '.jsx'), code);

	// o script tem que ser ES3 válido o bastante para o ExtendScript: sem let/const/arrow/template
	if (/\b(let|const)\s|=>|`/.test(code)) throw new Error('código gerado usa sintaxe moderna');

	ctx.$.global.BIN_PANEL = true;
	vm.runInContext(code, ctx, { filename: label + '.jsx' });
	const last = ctx.$.global.BIN_LAST;
	if (!last || !last.ok) throw new Error('script não terminou');
	const newComp = ctx.app.project.activeItem;
	if (newComp === comp) throw new Error('a comp nova não foi criada');

	const after = capture(ctx);
	const a = JSON.parse(JSON.stringify(before)), b = JSON.parse(JSON.stringify(after));
	[a, b].forEach((c) => c.layers.forEach((L) => { delete L.id; delete L.attrsId; delete L.markersId; (function strip(ns) { ns.forEach((n) => { delete n.id; delete n.dup; if (n.kids) strip(n.kids); }); })(L.groups); }));
	// o solid recriado ganha outro nome de item no projeto
	const d = diff(a.layers, b.layers, 'layers', []);
	return { code, errors: last.errors, diff: d, layers: last.layers };
}

let failed = false;
[
	['funcoes', {}],
	['inline', { wrap: false, comments: false }]
].forEach(([label, opts]) => {
	const r = run(opts, label);
	const lines = r.code.split('\n').length;
	console.log(`[${label}] ${r.layers.length} layers recriadas · ${lines} linhas · ${r.errors.length} erro(s) no script · ${r.diff.length} diferença(s)`);
	r.errors.forEach((e) => console.log('   erro:', e));
	r.diff.slice(0, 30).forEach((e) => console.log('   ≠', e));
	if (r.errors.length || r.diff.length) failed = true;
});

// opções: sem keyframes nem expressões
{
	const ctx = createContext();
	loadHost(ctx, path.join(__dirname, '../bin-cep/jsx/host.jsx'));
	const comp = scene(ctx);
	comp._layers.forEach((l) => { l.selected = true; });
	const cap = CG.prepare(capture(ctx));
	const code = CG.generate(cap, { keys: false, expr: false });
	const ok = !/bin\.keys\(/.test(code) && !/bin\.expr\(/.test(code);
	console.log(`[sem keys/expr] ${ok ? 'ok' : 'FALHOU'}`);
	if (!ok) failed = true;

	// exclusões: tira o efeito Glow e a layer da luz
	const shp = cap.layers.find((L) => L.name === 'TITULO_principal');
	const fx = shp.groups.find((g) => g.mn === 'ADBE Effect Parade');
	const glow = fx.kids.find((k) => k.mn === 'ADBE Glo2');
	const light = cap.layers.find((L) => L.type === 'light');
	const ex = {}; ex[glow.id] = true; ex[light.id] = true;
	const code2 = CG.generate(cap, { excluded: ex });
	const ok2 = !/ADBE Glo2/.test(code2) && !/addLight/.test(code2) && /ADBE Fill/.test(code2);
	console.log(`[exclusões] ${ok2 ? 'ok' : 'FALHOU'}`);
	if (!ok2) failed = true;
}

// utilitários
{
	const ex = CG.expressions([{ layer: 'TITULO', path: 'Transform › Rotation', name: 'Rotation', x: 'var a = "x";\nwiggle(2, a);' }]);
	const ctx = vm.createContext({});
	vm.runInContext(ex, ctx);
	const ok = ctx.expRotation === 'var a = "x";\nwiggle(2, a);';
	console.log(`[expressão → string] ${ok ? 'ok' : 'FALHOU'}`);
	if (!ok) failed = true;

	const bytes = new Uint8Array(256); for (let i = 0; i < 256; i++) bytes[i] = i;
	const s = vm.runInNewContext(CG.binaryString(bytes));
	let ok2 = s.length === 256;
	for (let i = 0; i < 256 && ok2; i++) if (s.charCodeAt(i) !== i) ok2 = false;
	console.log(`[arquivo → binário] ${ok2 ? 'ok' : 'FALHOU'}`);
	if (!ok2) failed = true;
}

process.exit(failed ? 1 : 0);
