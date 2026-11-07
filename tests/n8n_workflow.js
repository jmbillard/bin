// Testa o workflow do BIN docs num n8n de verdade, com uma OpenAI falsa local:
// importa credenciais e workflow, ativa, manda um pacote real (multipart com prints) e confere
// o que chegou na "OpenAI" (prompt, ficha, imagens em base64) e a resposta ao app.
// uso: N8N_BIN=<caminho do executável n8n> node tests/n8n_workflow.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const Ficha = require('../docs-app/js/ficha.js');

const ROOT = path.resolve(__dirname, '..');
const N8N = process.env.N8N_BIN || 'n8n';
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-n8n-'));
const PORT = 5688, AI_PORT = 5699, TOKEN = 'segredo-de-teste';

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };

const env = Object.assign({}, process.env, {
	N8N_USER_FOLDER: HOME, N8N_PORT: String(PORT), N8N_ENCRYPTION_KEY: 'chave-de-teste-bin-docs',
	N8N_DIAGNOSTICS_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
	N8N_SECURE_COOKIE: 'false', DB_SQLITE_POOL_SIZE: '1', N8N_RUNNERS_ENABLED: 'true', N8N_LOG_LEVEL: 'warn',
	N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false', WEBHOOK_URL: 'http://127.0.0.1:' + PORT + '/'
});
const cli = (args) => execFileSync(N8N, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// OpenAI falsa: guarda o pedido e responde com um markdown em bloco de código (o workflow tem que tirar o bloco)
const aiCalls = [];
const ai = http.createServer((req, res) => {
	let body = '';
	req.on('data', (c) => { body += c; });
	req.on('end', () => {
		const j = JSON.parse(body || '{}');
		aiCalls.push({ url: req.url, auth: req.headers.authorization, body: j });
		const mode = /## pedido/.test(JSON.stringify(j)) ? 'revise' : 'draft';
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ model: j.model, choices: [{ message: { role: 'assistant', content: '```markdown\n# 🥖 rascunho ' + mode + '\n\n![controles](imagens/print-1.png)\n```' } }], usage: { total_tokens: 1234 } }));
	});
});

function waitFor(url, ms) {
	const t0 = Date.now();
	return new Promise((resolve, reject) => {
		(function poll() {
			http.get(url, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => {
				if (Date.now() - t0 > ms) reject(new Error('n8n não respondeu em ' + ms / 1000 + ' s'));
				else setTimeout(poll, 1000);
			});
		})();
	});
}

function multipart(fields, files) {
	const b = '----bin' + Date.now();
	const parts = [];
	Object.keys(fields).forEach((k) => parts.push(Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + fields[k] + '\r\n')));
	files.forEach((f) => {
		parts.push(Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="' + f.field + '"; filename="' + f.name + '"\r\nContent-Type: image/png\r\n\r\n'));
		parts.push(f.data, Buffer.from('\r\n'));
	});
	parts.push(Buffer.from('--' + b + '--\r\n'));
	return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + b };
}

function post(pathname, fields, files, token) {
	const m = multipart(fields, files);
	return new Promise((resolve, reject) => {
		const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: 'POST', headers: Object.assign({ 'content-type': m.type, 'content-length': m.body.length }, token ? { 'x-bin-token': token } : {}) }, (r) => {
			let s = '';
			r.on('data', (c) => { s += c; });
			r.on('end', () => resolve({ status: r.statusCode, body: s, headers: r.headers }));
		});
		req.on('error', reject);
		req.end(m.body);
	});
}

(async () => {
	await new Promise((r) => ai.listen(AI_PORT, '127.0.0.1', r));

	// workflow de teste: o mesmo, com a OpenAI apontando para o servidor falso
	const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs-app/n8n/workflow.json'), 'utf8'));
	wf.id = 'bindocs000000001';
	wf.active = false;
	wf.nodes.forEach((n) => {
		if (n.name === 'OpenAI') { n.parameters.url = 'http://127.0.0.1:' + AI_PORT + '/v1/chat/completions'; n.credentials.openAiApi.id = 'credopenai000001'; }
		if (n.name === 'recebe o pacote') n.credentials.httpHeaderAuth.id = 'credtoken0000001';
	});
	const creds = [
		{ id: 'credopenai000001', name: 'OpenAI', type: 'openAiApi', data: { apiKey: 'sk-teste' } },
		{ id: 'credtoken0000001', name: 'BIN docs · X-Bin-Token', type: 'httpHeaderAuth', data: { name: 'X-Bin-Token', value: TOKEN } }
	];
	fs.writeFileSync(path.join(HOME, 'wf.json'), JSON.stringify([wf]));
	fs.writeFileSync(path.join(HOME, 'creds.json'), JSON.stringify(creds));

	try {
		cli(['import:credentials', '--input=' + path.join(HOME, 'creds.json')]);
		cli(['import:workflow', '--input=' + path.join(HOME, 'wf.json')]);
		check(true, 'n8n importou credenciais e workflow');
	} catch (e) {
		check(false, 'importar no n8n: ' + (e.stderr || e.message).toString().slice(0, 400));
		ai.close(); process.exit(1);
	}
	// ativar (n8n 2.x: publish; versões anteriores: update:workflow --active)
	let activated = false;
	for (const args of [['publish:workflow', '--id=' + wf.id], ['update:workflow', '--id=' + wf.id, '--active=true']]) {
		try { cli(args); activated = true; break; } catch (e) { /* tenta o próximo */ }
	}
	check(activated, 'workflow ativado');

	const n8n = spawn(N8N, ['start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
	let log = '';
	n8n.stdout.on('data', (c) => { log += c; });
	n8n.stderr.on('data', (c) => { log += c; });
	const stop = () => { n8n.kill('SIGTERM'); ai.close(); };

	try {
		await waitFor('http://127.0.0.1:' + PORT + '/healthz', 120000);
		await new Promise((r) => setTimeout(r, 3000));

		// healthcheck do workflow
		const h = await new Promise((resolve) => http.get('http://127.0.0.1:' + PORT + '/webhook/bin-docs-health', (r) => { let s = ''; r.on('data', (c) => { s += c; }); r.on('end', () => resolve({ status: r.statusCode, body: s })); }).on('error', (e) => resolve({ status: 0, body: e.message })));
		check(h.status === 200 && /"ok":\s*true/.test(h.body), 'healthcheck responde ok (' + h.status + ')');

		// pacote real, como o app manda
		const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs-app/exemplo/abertura_v03_doc.json'), 'utf8'));
		const f = Ficha.build(pack);
		const png = fs.readFileSync(path.join(ROOT, 'docs/img/logo.png'));
		const fields = {
			mode: 'draft', request_id: 'teste1', template_name: f.name, comp_name: f.comp, ficha: f.text, notes: 'o amp é a intensidade do tremor.',
			images: JSON.stringify([{ field: 'preview', file: 'imagens/preview.png', caption: 'preview do template' }, { field: 'image_0', file: 'imagens/print-1.png', caption: 'controles do layer CONTROLE' }]),
			summary: JSON.stringify({ controls: f.controls })
		};
		const files = [{ field: 'preview', name: 'preview.png', data: png }, { field: 'image_0', name: 'print-1.png', data: png }];

		const denied = await post('/webhook/bin-docs', fields, files, 'token-errado');
		check(denied.status === 403 || denied.status === 401, 'token errado é recusado (' + denied.status + ')');

		const r = await post('/webhook/bin-docs', fields, files, TOKEN);
		let j = {};
		try { j = JSON.parse(r.body); } catch (e) { }
		check(r.status === 200 && j.markdown === '# 🥖 rascunho draft\n\n![controles](imagens/print-1.png)', 'rascunho: 200 com o markdown sem o bloco de código');
		console.log('info  CORS na resposta: ' + (r.headers['access-control-allow-origin'] || '(sem cabeçalho)'));

		// o navegador manda um OPTIONS antes (o cabeçalho X-Bin-Token não é "simples")
		const pre = await new Promise((resolve) => {
			const q = http.request({ host: '127.0.0.1', port: PORT, path: '/webhook/bin-docs', method: 'OPTIONS', headers: { origin: 'https://docs.exemplo.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-bin-token' } }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
			q.on('error', (e) => resolve({ statusCode: 0, headers: {}, err: e.message }));
			q.end();
		});
		const allowO = pre.headers['access-control-allow-origin'] || '';
		const allowH = (pre.headers['access-control-allow-headers'] || '').toLowerCase();
		check(pre.statusCode >= 200 && pre.statusCode < 300 && (allowO === '*' || allowO === 'https://docs.exemplo.test') && (allowH === '*' || allowH.indexOf('x-bin-token') >= 0),
			'CORS: o OPTIONS do navegador libera a origem e o cabeçalho X-Bin-Token (' + pre.statusCode + ', origin ' + allowO + ', headers ' + allowH + ')');

		const call = aiCalls[0] || { body: {} };
		const msgs = call.body.messages || [];
		const user = (msgs[1] && msgs[1].content) || [];
		const imgs = user.filter((c) => c.type === 'image_url');
		check(call.auth === 'Bearer sk-teste', 'OpenAI: credencial no cabeçalho Authorization');
		check(msgs[0] && /O PADEIRO/.test(msgs[0].content) && /✎ confirmar/.test(msgs[0].content), 'OpenAI: prompt do sistema (prompt.md)');
		check(user[0] && /controles de expressão/.test(user[0].text) && /tremor/.test(user[0].text) && /imagens\/print-1\.png: controles do layer CONTROLE/.test(user[0].text), 'OpenAI: ficha, notas e lista de imagens');
		check(imgs.length === 2 && imgs.every((i) => i.image_url.url === 'data:image/png;base64,' + png.toString('base64')), 'OpenAI: 2 imagens em base64, iguais às enviadas');
		check(call.body.model === 'gpt-4o', 'OpenAI: modelo ' + call.body.model);

		// ajuste
		const rv = await post('/webhook/bin-docs', Object.assign({}, fields, { mode: 'revise', markdown: '# texto atual', instruction: 'encurte' }), [], TOKEN);
		let jr = {};
		try { jr = JSON.parse(rv.body); } catch (e) { }
		const rc = aiCalls[1] || { body: { messages: [{}, { content: [{}] }] } };
		check(rv.status === 200 && /rascunho revise/.test(jr.markdown || '') && /## pedido\nencurte/.test(rc.body.messages[1].content[0].text) && rc.body.messages[1].content.length === 1, 'ajuste: pedido e texto atual, sem imagens');

		// OpenAI fora: o app recebe erro
		ai.close();
		const down = await post('/webhook/bin-docs', fields, [], TOKEN);
		check(down.status === 502 && /OpenAI/.test(down.body), 'OpenAI fora do ar: 502 com a mensagem (' + down.status + ')');
	} catch (e) {
		check(false, e.message);
		console.log(log.slice(-3000));
	}
	stop();
	setTimeout(() => process.exit(failed ? 1 : 0), 1500);
})();
