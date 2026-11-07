// Monta o workflow do n8n (workflow.json) com o prompt de prompt.md embutido.
// uso: node docs-app/n8n/build_workflow.js
'use strict';
const fs = require('fs');
const path = require('path');

const PROMPT = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');

// nó "monta o pedido": mensagens para a API de chat da OpenAI, com as imagens em base64
const buildCode = `// troque pelo modelo da OpenAI com visão que preferir
const MODEL = 'gpt-4o';
const PROMPT = ${JSON.stringify(PROMPT)};

const item = $input.first();
const b = item.json.body || {};
const mode = b.mode === 'revise' ? 'revise' : 'draft';
let images = [];
try { images = JSON.parse(b.images || '[]'); } catch (e) { images = []; }
const imageList = images.length
  ? images.map((i) => '- ' + i.file + ': ' + (i.caption || '(sem legenda)')).join('\\n')
  : '(nenhuma imagem)';

const content = [];
if (mode === 'draft') {
  content.push({ type: 'text', text: [
    'escreva a documentação do template "' + (b.template_name || '') + '" (comp principal "' + (b.comp_name || '') + '").',
    '',
    b.ficha || '',
    '',
    '## notas do autor',
    b.notes || '(nenhuma)',
    '',
    '## imagens anexadas (use exatamente estes caminhos)',
    imageList
  ].join('\\n') });
  for (const img of images) {
    const bin = item.binary && item.binary[img.field];
    if (!bin) continue;
    const buf = await this.helpers.getBinaryDataBuffer(0, img.field);
    content.push({ type: 'text', text: 'imagem ' + img.file + ': ' + (img.caption || '(sem legenda)') });
    content.push({ type: 'image_url', image_url: { url: 'data:' + (bin.mimeType || 'image/png') + ';base64,' + buf.toString('base64'), detail: 'high' } });
  }
} else {
  content.push({ type: 'text', text: [
    'ajuste a documentação do template "' + (b.template_name || '') + '".',
    '',
    '## pedido',
    b.instruction || '',
    '',
    '## documentação atual',
    b.markdown || '',
    '',
    '## ficha técnica (referência)',
    b.ficha || '',
    '',
    '## imagens disponíveis (use exatamente estes caminhos)',
    imageList
  ].join('\\n') });
}

return [{ json: { mode, payload: { model: MODEL, temperature: 0.3, messages: [{ role: 'system', content: PROMPT }, { role: 'user', content }] } } }];
`;

// nó "extrai o markdown": tira a resposta da OpenAI (ou o erro)
const extractCode = `const r = $input.first().json || {};
if (r.error) {
  const msg = typeof r.error === 'string' ? r.error : (r.error.message || JSON.stringify(r.error));
  return [{ json: { error: 'OpenAI: ' + msg, status: 502 } }];
}
let md = (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
md = String(md).replace(/^\\s*\`\`\`(?:markdown|md)?\\s*\\n([\\s\\S]*?)\\n\`\`\`\\s*$/, '$1').trim();
if (!md) return [{ json: { error: 'a OpenAI respondeu sem texto.', status: 502 } }];
return [{ json: { markdown: md, model: r.model || '', usage: r.usage || null, status: 200 } }];
`;

const workflow = {
	name: 'BIN docs · documentação de templates do padeiro',
	nodes: [
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0001',
			name: 'recebe o pacote',
			type: 'n8n-nodes-base.webhook',
			typeVersion: 2,
			position: [0, 0],
			webhookId: '6b1d0c50-0000-4000-8000-000000000001',
			parameters: {
				httpMethod: 'POST',
				path: 'bin-docs',
				authentication: 'headerAuth',
				responseMode: 'responseNode',
				options: { allowedOrigins: '*' }
			},
			credentials: { httpHeaderAuth: { id: '', name: 'BIN docs · X-Bin-Token' } }
		},
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0002',
			name: 'monta o pedido',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [240, 0],
			parameters: { jsCode: buildCode }
		},
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0003',
			name: 'OpenAI',
			type: 'n8n-nodes-base.httpRequest',
			typeVersion: 4.2,
			position: [480, 0],
			onError: 'continueRegularOutput',
			parameters: {
				method: 'POST',
				url: 'https://api.openai.com/v1/chat/completions',
				authentication: 'predefinedCredentialType',
				nodeCredentialType: 'openAiApi',
				sendBody: true,
				specifyBody: 'json',
				jsonBody: '={{ JSON.stringify($json.payload) }}',
				options: { timeout: 240000 }
			},
			credentials: { openAiApi: { id: '', name: 'OpenAI' } }
		},
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0004',
			name: 'extrai o markdown',
			type: 'n8n-nodes-base.code',
			typeVersion: 2,
			position: [720, 0],
			parameters: { jsCode: extractCode }
		},
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0005',
			name: 'responde ao app',
			type: 'n8n-nodes-base.respondToWebhook',
			typeVersion: 1.1,
			position: [960, 0],
			parameters: {
				respondWith: 'json',
				responseBody: '={{ JSON.stringify($json.error ? { error: $json.error } : { markdown: $json.markdown, model: $json.model }) }}',
				options: { responseCode: '={{ $json.status }}' }
			}
		},
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0006',
			name: 'healthcheck',
			type: 'n8n-nodes-base.webhook',
			typeVersion: 2,
			position: [0, 220],
			webhookId: '6b1d0c50-0000-4000-8000-000000000002',
			parameters: { httpMethod: 'GET', path: 'bin-docs-health', responseMode: 'responseNode', options: { allowedOrigins: '*' } }
		},
		{
			id: 'a1d0c6f2-1b7e-4d7e-9a51-2f6a7c1b0007',
			name: 'responde ok',
			type: 'n8n-nodes-base.respondToWebhook',
			typeVersion: 1.1,
			position: [240, 220],
			parameters: { respondWith: 'json', responseBody: '={"ok": true}', options: {} }
		}
	],
	connections: {
		'recebe o pacote': { main: [[{ node: 'monta o pedido', type: 'main', index: 0 }]] },
		'monta o pedido': { main: [[{ node: 'OpenAI', type: 'main', index: 0 }]] },
		OpenAI: { main: [[{ node: 'extrai o markdown', type: 'main', index: 0 }]] },
		'extrai o markdown': { main: [[{ node: 'responde ao app', type: 'main', index: 0 }]] },
		healthcheck: { main: [[{ node: 'responde ok', type: 'main', index: 0 }]] }
	},
	settings: { executionOrder: 'v1' },
	pinData: {}
};

const out = path.join(__dirname, 'workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('workflow:', path.relative(process.cwd(), out));
