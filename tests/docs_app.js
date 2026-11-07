// Testa o app web de documentação (docs-app) de ponta a ponta, com um webhook falso no lugar do n8n.
// confere o que o app envia (campos, prints, preview), o rascunho, o ajuste, o desfazer e o .zip exportado.
// uso: node tests/docs_app.js [pasta de saída]
// sem internet para o cdnjs: BIN_CDN_DIR=<pasta com marked.min.js, purify.min.js e jszip.min.js>
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
fs.mkdirSync(outDir, { recursive: true });
const PACK = path.join(ROOT, 'docs-app/exemplo/abertura_v03_doc.json');
const CDN = process.env.BIN_CDN_DIR;
const HOOK = 'https://n8n.exemplo.test/webhook/bin-docs';
const HEALTH = 'https://n8n.exemplo.test/webhook/bin-docs-health';

const DRAFT = [
	'# 🥖 ABERTURA v03 · CRÉDITO DE DIREÇÃO',
	'',
	'abertura com o crédito de direção sobre a barra azul animada.',
	'',
	'![preview](imagens/preview.png)',
	'',
	'## 📍 como preencher',
	'',
	'| ordem | layer | o que escrever |',
	'| --- | --- | --- |',
	'| 1 | CRÉDITO direção | a função na 1ª linha e o nome na 2ª |',
	'',
	'## 📍 controles',
	'',
	'| controle | onde fica | o que faz | padrão |',
	'| --- | --- | --- | --- |',
	'| **amp** | CONTROLE | intensidade do tremor do título | 3 |',
	'',
	'![controles do layer CONTROLE](imagens/print-1.png)',
	'',
	'> 🚩 *obs:* ✎ confirmar: valores acima de 10 deixam o título ilegível.'
].join('\n');

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, acceptDownloads: true, colorScheme: 'dark' });
	page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });

	if (CDN) {
		await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/.+\/([\w.]+\.js)$/, (route) => {
			const name = route.request().url().split('/').pop();
			route.fulfill({ path: path.join(CDN, name), contentType: 'application/javascript' });
		});
	}

	const calls = [];
	await page.route(HEALTH, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
	await page.route(HOOK, async (route) => {
		const req = route.request();
		const body = req.postDataBuffer().toString('latin1');
		const field = (name) => { const m = new RegExp('name="' + name + '"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--').exec(body); return m ? Buffer.from(m[1], 'latin1').toString('utf8') : null; };
		const call = {
			mode: field('mode'), token: req.headers()['x-bin-token'], ficha: field('ficha'), notes: field('notes'),
			images: JSON.parse(field('images') || '[]'), instruction: field('instruction'), markdown: field('markdown'),
			files: (body.match(/name="(image_\d+|preview)"; filename="[^"]+"/g) || []).length
		};
		calls.push(call);
		await new Promise((r) => setTimeout(r, 700)); // o "agente" pensando
		const md = call.mode === 'revise' ? call.markdown.replace('abertura com o crédito', 'abertura curta com o crédito') : DRAFT;
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ markdown: md }) });
	});

	await page.addInitScript(({ HOOK, HEALTH }) => {
		try { localStorage.clear(); localStorage.setItem('bin-docs.settings', JSON.stringify({ url: HOOK, health: HEALTH, token: 'segredo' })); } catch (e) { }
	}, { HOOK, HEALTH });
	await page.goto('file://' + path.join(ROOT, 'docs-app/index.html'));
	await page.waitForTimeout(400);
	check(await page.evaluate(() => !!window.marked && !!window.DOMPurify && !!window.JSZip), 'bibliotecas do cdnjs carregadas');
	check(/n8n no ar/.test(await page.textContent('#health')), 'healthcheck: n8n no ar');
	check(await page.isDisabled('#sendBtn'), 'sem pacote: gerar rascunho desligado');
	await page.screenshot({ path: path.join(outDir, 'docs-1-vazio.png') });

	// pacote
	await page.setInputFiles('#packInput', PACK);
	await page.waitForSelector('#templateCard:not(.hidden)');
	check((await page.textContent('#tplName')) === 'ABERTURA v03 · CRÉDITO DE DIREÇÃO', 'pacote: nome da configuração');
	check(/1 controle/.test(await page.textContent('#tplChips')) && /1 layer editável/.test(await page.textContent('#tplChips')), 'pacote: controles e layers editáveis');
	check(/amp/.test(await page.textContent('#fichaText')), 'ficha técnica com o controle amp');

	// print colado (Ctrl+V)
	const png = fs.readFileSync(path.join(ROOT, 'docs/img/11-tooltip.png')).toString('base64');
	await page.evaluate((b64) => {
		const bin = atob(b64), u = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
		const dt = new DataTransfer();
		dt.items.add(new File([u], 'image.png', { type: 'image/png' }));
		document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
	}, png);
	await page.waitForSelector('.shot');
	await page.fill('.shot input', 'controles do layer CONTROLE');
	await page.fill('#notes', 'o amp é a intensidade do tremor do título.');
	await page.mouse.move(1, 1);
	await page.screenshot({ path: path.join(outDir, 'docs-2-pacote.png') });

	// rascunho
	await page.click('#sendBtn');
	await page.waitForSelector('#phase-processing', { state: 'visible' });
	await page.screenshot({ path: path.join(outDir, 'docs-3-processando.png') });
	await page.waitForSelector('#phase-review', { state: 'visible', timeout: 10000 });
	const c = calls[0];
	check(c && c.mode === 'draft' && c.token === 'segredo', 'webhook: modo draft com o token no cabeçalho');
	check(c && c.files === 2 && c.images.length === 2 && c.images[1].file === 'imagens/print-1.png' && c.images[1].caption === 'controles do layer CONTROLE', 'webhook: preview + print com legenda e caminho');
	check(c && /controles de expressão/.test(c.ficha) && /tremor/.test(c.notes), 'webhook: ficha técnica e notas');
	await page.waitForTimeout(300);
	const imgs = await page.$$eval('#preview img', (els) => els.map((e) => e.src));
	check(imgs.length === 2 && imgs.every((s) => s.startsWith('blob:')), 'prévia: as imagens do markdown viram os prints carregados');
	await page.screenshot({ path: path.join(outDir, 'docs-4-revisao.png') });

	// edição manual + salvamento
	await page.click('#md');
	await page.keyboard.press('Control+End');
	await page.keyboard.type('\n\n## 📍 texto para as dicas do padeiro\n');
	await page.waitForTimeout(900);
	check(/dicas do padeiro/.test(await page.textContent('#preview')), 'edição aparece na prévia');
	check(/salvo neste navegador/.test(await page.textContent('#savedInfo')), 'rascunho salvo automaticamente');

	// ajuste e desfazer
	await page.fill('#reviseInput', 'encurte a introdução');
	await page.click('#reviseBtn');
	await page.waitForFunction(() => /abertura curta/.test(document.getElementById('md').value), null, { timeout: 10000 });
	const r = calls[1];
	check(r && r.mode === 'revise' && r.instruction === 'encurte a introdução' && /dicas do padeiro/.test(r.markdown) && r.files === 0, 'ajuste: envia o texto atual e o pedido, sem reenviar imagens');
	await page.click('#undoBtn');
	check(!/abertura curta/.test(await page.inputValue('#md')), 'desfazer ajuste volta ao texto anterior');
	await page.click('#undoBtn');
	check(/abertura curta/.test(await page.inputValue('#md')), 'refazer ajuste');

	// exportar .zip
	const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#zipBtn')]);
	const zipPath = path.join(outDir, dl.suggestedFilename());
	await dl.saveAs(zipPath);
	const list = execFileSync('python3', ['-I', '-c', 'import zipfile,sys;print("\\n".join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))', zipPath]).toString().trim().split('\n');
	check(dl.suggestedFilename() === 'abertura_v03_credito_de_direcao.zip' && list.join(',') === 'abertura_v03_credito_de_direcao.md,imagens/preview.png,imagens/print-1.png', '.zip com o .md e as imagens usadas');

	// volta e reabre o rascunho salvo
	await page.click('#backBtn');
	check((await page.textContent('#localBtn')) === 'abrir rascunho salvo', 'pacote do mesmo template oferece o rascunho salvo');

	// rascunho sem IA, em outro navegador limpo
	await page.evaluate(() => { localStorage.removeItem(window.BINDOCS.key); });
	await page.setInputFiles('#packInput', PACK);
	await page.click('#localBtn');
	await page.waitForSelector('#phase-review', { state: 'visible' });
	const local = await page.inputValue('#md');
	check(/\| \*\*amp\*\* \| slider \| CONTROLE \| 3 \|/.test(local) && /CRÉDITO direção/.test(local) && /imagens\/print-1\.png/.test(local), 'rascunho sem IA: tabela de controles, layers e prints');

	await browser.close();
	process.exit(failed ? 1 : 0);
})();
