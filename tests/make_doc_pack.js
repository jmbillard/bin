// Gera um pacote de documentação de exemplo (o mesmo formato que o botão "pacote para documentação"
// do BIN salva) a partir da comp de teste, com um _config.json no formato do padeiro.
// uso: node tests/make_doc_pack.js
'use strict';
const fs = require('fs');
const path = require('path');
const { createContext, loadHost } = require('./ae_mock');
const CG = require('../bin-cep/js/codegen.js');
const Ficha = require('../docs-app/js/ficha.js');
const scene = require('./scene');

const ROOT = path.resolve(__dirname, '..');
const ctx = createContext();
loadHost(ctx, path.join(ROOT, 'bin-cep/jsx/host.jsx'));
scene(ctx);

const raw = JSON.parse(ctx.bin_captureComp());
const capture = JSON.parse(JSON.stringify(raw));
const preview = fs.readFileSync(path.join(ROOT, 'docs/img/logo.png')).toString('base64');

const pack = {
	format: 'bin-doc-pack',
	version: 1,
	created: '2026-11-07T14:30:00.000Z',
	ae: raw.ae,
	capture,
	template: {
		project: '//servidor/PROMO/templates/ABERTURA/ABERTURA_v03.aep',
		configPath: '//servidor/PROMO/templates/ABERTURA/ABERTURA_v03_config.json',
		script: false,
		fonts: ['Inter-Bold.ttf'],
		preview: 'data:image/png;base64,' + preview,
		config: {
			configName: 'ABERTURA v03 · CRÉDITO DE DIREÇÃO',
			exemple: 'Direção\nANA BEATRIZ LIMA',
			tip: 'digite a função na 1ª linha e o nome na 2ª.\n\nnomes longos: use no máximo 28 caracteres.',
			compName: 'ABERTURA_v03',
			prefix: 'ABT',
			refTime: 2,
			separator: '\n',
			textCase: 'freeCase',
			inputLayers: [{ layerIndex: 4, method: 'textContent' }],
			importPath: '~/Downloads',
			outputPath: ['//servidor/PROMO/output/ABERTURA']
		}
	},
	code: CG.generate(CG.prepare(raw), { target: 'new' })
};

const out = path.join(ROOT, 'docs-app/exemplo/abertura_v03_doc.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(pack));
const f = Ficha.build(pack);
fs.writeFileSync(path.join(ROOT, 'docs-app/exemplo/ficha.md'), f.text);
console.log('pacote:', path.relative(ROOT, out), (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
console.log('ficha:', f.text.length, 'caracteres ·', f.controls.length, 'controles ·', f.expressions.length, 'expressões ·', f.editable.length, 'layers editáveis');
