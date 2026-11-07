/*
 * BIN docs · documentação dos templates do padeiro
 *
 * 1 · pacote e prints → o pacote .json exportado pelo BIN + prints dos controles (colar / arrastar)
 * 2 · rascunho        → envia a ficha técnica, as notas e as imagens ao webhook do n8n
 * 3 · revisão         → editor markdown com prévia, ajustes pedidos ao agente e exportação (.md / .zip)
 *
 * contrato do webhook: veja docs-app/README.md.
 */
(function () {
	'use strict';

	// ------------------------------------------------------------ config ---
	// os endereços também podem ser definidos na tela (⚙), salvos neste navegador
	var CONFIG = {
		DRAFT_WEBHOOK_URL: '',
		HEALTHCHECK_URL: '',
		TOKEN: '',
		TIMEOUT_MS: 240000,
		HEALTH_INTERVAL_MS: 30000,
		HEALTH_TIMEOUT_MS: 5000,
		MAX_IMAGE_BYTES: 8 * 1024 * 1024
	};
	var SETTINGS_KEY = 'bin-docs.settings';
	var DRAFT_KEY = 'bin-docs.draft.';

	function settings() {
		var s = {};
		try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
		return {
			url: s.url !== undefined ? s.url : CONFIG.DRAFT_WEBHOOK_URL,
			health: s.health !== undefined ? s.health : CONFIG.HEALTHCHECK_URL,
			token: s.token !== undefined ? s.token : CONFIG.TOKEN
		};
	}

	var $ = function (id) { return document.getElementById(id); };
	var state = {
		pack: null, ficha: null, key: '',
		preview: null,            // { blob, url }
		shots: [],                // { id, blob, url, name, caption }
		md: '', controller: null, timer: null, saveTimer: null, seq: 0
	};
	window.BINDOCS = state;

	// ------------------------------------------------------------ helpers --
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

	var toastTimer = null;
	function toast(msg, kind) {
		var t = $('toast');
		t.textContent = msg;
		t.className = 'toast show' + (kind === 'error' ? ' error' : '');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { t.className = 'toast'; }, kind === 'error' ? 6000 : 2600);
	}

	function phase(p) {
		document.body.dataset.phase = p;
		window.scrollTo(0, 0);
	}

	function dataURLtoBlob(url) {
		var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(url);
		if (!m) return null;
		var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
		var u = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
		return new Blob([u], { type: m[1] || 'application/octet-stream' });
	}

	function extOf(blob) {
		return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[blob.type] || 'png';
	}

	function slug(s) {
		return String(s || 'template').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'template';
	}

	function download(blob, name) {
		var a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	}

	// ------------------------------------------------------- healthcheck --
	function checkHealth() {
		var s = settings(), el = $('health');
		var label = el.querySelector('span');
		if (!s.url) {
			el.className = 'health';
			label.textContent = 'sem webhook';
			el.title = 'configure o webhook do n8n em ⚙';
			updateButtons();
			return;
		}
		if (!s.health) {
			el.className = 'health';
			label.textContent = 'webhook configurado';
			updateButtons();
			return;
		}
		var ctl = new AbortController();
		var t = setTimeout(function () { ctl.abort(); }, CONFIG.HEALTH_TIMEOUT_MS);
		fetch(s.health, { headers: s.token ? { 'X-Bin-Token': s.token } : {}, signal: ctl.signal })
			.then(function (r) { el.className = 'health ' + (r.ok ? 'ok' : 'bad'); label.textContent = r.ok ? 'n8n no ar' : 'n8n com erro (' + r.status + ')'; })
			.catch(function () { el.className = 'health bad'; label.textContent = 'n8n fora do ar'; })
			.then(function () { clearTimeout(t); updateButtons(); });
	}

	// --------------------------------------------------------- pacote ------
	function loadPackFile(file) {
		if (!file) return;
		var r = new FileReader();
		r.onload = function () {
			try { loadPack(JSON.parse(r.result)); } catch (e) { toast('não foi possível ler o pacote: ' + e.message, 'error'); }
		};
		r.readAsText(file);
	}

	function loadPack(pack) {
		var ficha = window.Ficha.build(pack); // valida o formato
		state.pack = pack;
		state.ficha = ficha;
		state.key = DRAFT_KEY + slug(ficha.name);
		if (state.preview) URL.revokeObjectURL(state.preview.url);
		state.preview = null;
		var tpl = pack.template || {};
		if (tpl.preview) {
			var b = dataURLtoBlob(tpl.preview);
			if (b) state.preview = { blob: b, url: URL.createObjectURL(b) };
		}
		renderPack();
	}

	function renderPack() {
		var f = state.ficha, pack = state.pack;
		$('packDrop').classList.add('hidden');
		$('templateCard').classList.remove('hidden');
		$('tplPreview').src = state.preview ? state.preview.url : '';
		$('tplPreview').classList.toggle('hidden', !state.preview);
		$('tplName').textContent = f.name;
		var cap = pack.capture;
		var main = cap.mode === 'comp' ? cap.comps.filter(function (c) { return c.id === cap.root; })[0] : cap.comp;
		$('tplMeta').textContent = 'comp ' + f.comp + ' · ' + main.width + '×' + main.height + ' · exportado em ' + new Date(pack.created).toLocaleString('pt-BR');
		var chips = [
			[(cap.mode === 'comp' ? main.layers.length : cap.layers.length) + ' layers', ''],
			[f.controls.length + (f.controls.length === 1 ? ' controle' : ' controles'), f.controls.length ? 'ok' : ''],
			[f.expressions.length + (f.expressions.length === 1 ? ' expressão' : ' expressões'), ''],
			[f.editable.length + (f.editable.length === 1 ? ' layer editável' : ' layers editáveis'), f.editable.length ? 'ok' : 'k']
		];
		if (f.precomps.length) chips.push([f.precomps.length + ' precomps', '']);
		if (!(pack.template && pack.template.config)) chips.push(['sem _config.json', 'k']);
		$('tplChips').innerHTML = chips.map(function (c) { return '<span class="chip ' + c[1] + '">' + esc(c[0]) + '</span>'; }).join('');
		$('tplWarnings').innerHTML = f.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');
		$('tplWarnings').classList.toggle('hidden', !f.warnings.length);
		$('fichaText').textContent = f.text;
		$('fichaBox').classList.remove('hidden');

		var saved = loadDraft();
		$('localBtn').textContent = saved ? 'abrir rascunho salvo' : 'rascunho sem IA';
		$('localBtn').title = saved ? 'continua o rascunho salvo em ' + new Date(saved.at).toLocaleString('pt-BR') : 'monta um esqueleto a partir da ficha, sem IA';
		updateButtons();
	}

	function updateButtons() {
		$('sendBtn').disabled = !state.pack || !settings().url;
		$('sendBtn').title = !settings().url ? 'configure o webhook do n8n em ⚙' : '';
		$('localBtn').disabled = !state.pack;
	}

	// ---------------------------------------------------------- prints -----
	function addShots(files) {
		var added = 0;
		Array.prototype.forEach.call(files, function (f) {
			if (!/^image\//.test(f.type)) return;
			if (f.size > CONFIG.MAX_IMAGE_BYTES) { toast('“' + (f.name || 'imagem') + '” passa de 8 MB e ficou de fora.', 'error'); return; }
			state.seq++;
			var caption = f.name && !/^image\.\w+$/.test(f.name) ? f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : '';
			state.shots.push({ id: state.seq, blob: f, url: URL.createObjectURL(f), caption: caption, name: '' });
			added++;
		});
		renumber();
		renderShots();
		if (added) toast(added === 1 ? 'print adicionado.' : added + ' prints adicionados.');
	}

	function renumber() {
		state.shots.forEach(function (s, i) { s.name = 'print-' + (i + 1) + '.' + extOf(s.blob); });
	}

	function renderShots() {
		$('shots').innerHTML = state.shots.map(function (s) {
			return '<li class="shot" data-id="' + s.id + '"><img src="' + s.url + '" alt="">' +
				'<div class="shot-foot"><input value="' + esc(s.caption) + '" placeholder="legenda (o que mostra?)" data-cap="' + s.id + '"><button title="remover" data-rm="' + s.id + '">✕</button></div>' +
				'<small>imagens/' + esc(s.name) + '</small></li>';
		}).join('');
	}

	// ----------------------------------------------------------- envio -----
	function imagesManifest() {
		var list = [];
		if (state.preview) list.push({ field: 'preview', file: 'imagens/preview.' + extOf(state.preview.blob), caption: 'preview do template (frame de referência)' });
		state.shots.forEach(function (s, i) { list.push({ field: 'image_' + i, file: 'imagens/' + s.name, caption: s.caption || '' }); });
		return list;
	}

	function post(mode, extra) {
		var s = settings();
		var fd = new FormData();
		var f = state.ficha;
		fd.append('mode', mode);
		fd.append('request_id', Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
		fd.append('template_name', f.name);
		fd.append('comp_name', f.comp);
		fd.append('ficha', f.text);
		fd.append('notes', $('notes').value.trim());
		fd.append('images', JSON.stringify(imagesManifest()));
		fd.append('summary', JSON.stringify({ controls: f.controls, editable: f.editable, texts: f.texts, media: f.media, precomps: f.precomps, warnings: f.warnings }));
		Object.keys(extra || {}).forEach(function (k) { fd.append(k, extra[k]); });
		if (mode === 'draft') {
			if (state.preview) fd.append('preview', state.preview.blob, 'preview.' + extOf(state.preview.blob));
			state.shots.forEach(function (sh, i) { fd.append('image_' + i, sh.blob, sh.name); });
		}

		var ctl = state.controller = new AbortController();
		var timeout = setTimeout(function () { ctl.abort('timeout'); }, CONFIG.TIMEOUT_MS);
		var headers = s.token ? { 'X-Bin-Token': s.token } : {};
		return fetch(s.url, { method: 'POST', body: fd, headers: headers, signal: ctl.signal })
			.then(function (r) {
				return r.text().then(function (body) {
					if (!r.ok) throw new Error('o webhook respondeu ' + r.status + (body ? ': ' + body.slice(0, 200) : ''));
					var md = body;
					try {
						var j = JSON.parse(body);
						if (Array.isArray(j)) j = j[0];
						md = j.markdown || j.output || j.text || '';
					} catch (e) { /* resposta em texto puro */ }
					md = String(md).replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/, '$1').trim();
					if (!md) throw new Error('o webhook respondeu, mas sem markdown.');
					return md;
				});
			})
			.catch(function (e) {
				if (ctl.signal.aborted) throw new Error(ctl.signal.reason === 'timeout' ? 'o agente demorou demais (mais de ' + Math.round(CONFIG.TIMEOUT_MS / 1000) + ' s).' : 'cancelado.');
				throw e;
			})
			.then(function (md) { clearTimeout(timeout); state.controller = null; return md; }, function (e) { clearTimeout(timeout); state.controller = null; throw e; });
	}

	function startClock() {
		var t0 = Date.now();
		$('elapsed').textContent = '0 s';
		clearInterval(state.timer);
		state.timer = setInterval(function () { $('elapsed').textContent = Math.round((Date.now() - t0) / 1000) + ' s'; }, 500);
	}

	function sendDraft() {
		if (!state.pack) return;
		var missing = state.shots.filter(function (s) { return !s.caption.trim(); }).length;
		if (missing) toast(missing === 1 ? '1 print está sem legenda: o agente vai ter que adivinhar o que ele mostra.' : missing + ' prints estão sem legenda.');
		phase('processing');
		startClock();
		post('draft').then(function (md) {
			clearInterval(state.timer);
			openReview(md);
			toast('rascunho pronto. revise e ajuste à vontade.');
		}, function (e) {
			clearInterval(state.timer);
			phase('upload');
			toast(e.message, 'error');
		});
	}

	// ------------------------------------------------------- sem IA --------
	// esqueleto a partir da ficha: útil sem o n8n e como base para comparar com o agente
	function localDraft() {
		var f = state.ficha, cfg = (state.pack.template && state.pack.template.config) || {};
		var L = [];
		L.push('# ' + f.name, '');
		L.push('> ✎ rascunho montado a partir da ficha técnica, sem IA. complete os trechos marcados com ✎.', '');
		if (state.preview) L.push('![preview do template](imagens/preview.' + extOf(state.preview.blob) + ')', '');
		L.push('## para que serve', '', '✎ em uma ou duas frases: onde este template é usado e o que ele produz.', '');
		L.push('## como preencher', '');
		if (cfg.separator !== undefined) L.push('- cada bloco do input separado por uma **linha vazia** vira uma comp.');
		if (f.editable.length > 1) L.push('- as informações de cada bloco são separadas por `' + String(cfg.separator).replace(/\n/g, '\\n') + '`, na ordem abaixo.');
		if (cfg.textCase && cfg.textCase !== 'freeCase') L.push('- o texto é convertido para ' + ({ upperCase: '**CAIXA ALTA**', lowerCase: '**caixa baixa**', titleCase: '**Título**' })[cfg.textCase] + '.');
		L.push('');
		if (f.editable.length) {
			L.push('| ordem | layer | o que preencher |', '| --- | --- | --- |');
			f.editable.forEach(function (e) { L.push('| ' + e.order + ' | ' + e.layer + ' | ✎ (' + e.method + ') |'); });
			L.push('');
		}
		if (cfg.exemple) L.push('exemplo:', '', '```', String(cfg.exemple), '```', '');
		L.push('## controles', '');
		if (!f.controls.length) L.push('este template não tem controles de expressão.', '');
		else {
			L.push('| controle | tipo | onde fica | padrão | o que faz |', '| --- | --- | --- | --- | --- |');
			f.controls.forEach(function (c) { L.push('| **' + c.name + '** | ' + c.type + ' | ' + c.layer + ' | ' + c.value + ' | ✎ ' + (c.affects.length ? 'afeta ' + c.affects.join('; ') : '') + ' |'); });
			L.push('');
		}
		state.shots.forEach(function (s) { L.push('![' + (s.caption || s.name) + '](imagens/' + s.name + ')', ''); });
		L.push('## cuidados', '');
		if (state.pack.template && state.pack.template.fonts && state.pack.template.fonts.length) L.push('- fontes usadas: ' + state.pack.template.fonts.join(', ') + '.');
		if (f.media.length) L.push('- mídias: ' + f.media.map(function (m) { return m.source; }).join(', ') + '.');
		L.push('- ✎', '');
		return L.join('\n');
	}

	// -------------------------------------------------------- revisão ------
	function openReview(md) {
		state.md = md;
		state.prev = undefined;
		$('undoBtn').classList.add('hidden');
		$('undoBtn').textContent = 'desfazer ajuste';
		$('md').value = md;
		renderPreview();
		saveDraft(true);
		phase('review');
	}

	function imageMap() {
		var m = {};
		if (state.preview) m['imagens/preview.' + extOf(state.preview.blob)] = state.preview.url;
		state.shots.forEach(function (s) { m['imagens/' + s.name] = s.url; });
		return m;
	}

	function renderPreview() {
		var html = window.marked ? window.marked.parse(state.md) : '<pre>' + esc(state.md) + '</pre>';
		html = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
		var box = $('preview');
		box.innerHTML = html;
		var map = imageMap();
		Array.prototype.forEach.call(box.querySelectorAll('img'), function (img) {
			var src = img.getAttribute('src') || '';
			var key = src.replace(/^\.\//, '');
			if (map[key]) img.src = map[key];
		});
		Array.prototype.forEach.call(box.querySelectorAll('a[href]'), function (a) { a.target = '_blank'; a.rel = 'noopener'; });
	}

	function loadDraft() {
		try { return JSON.parse(localStorage.getItem(state.key) || 'null'); } catch (e) { return null; }
	}

	function saveDraft(now) {
		clearTimeout(state.saveTimer);
		var go = function () {
			try {
				localStorage.setItem(state.key, JSON.stringify({ md: state.md, at: Date.now() }));
				$('savedInfo').textContent = 'salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
			} catch (e) {
				$('savedInfo').textContent = 'não foi possível salvar neste navegador';
			}
		};
		if (now) go();
		else state.saveTimer = setTimeout(go, 700);
	}

	function revise(ev) {
		ev.preventDefault();
		var instruction = $('reviseInput').value.trim();
		if (!instruction) { $('reviseInput').focus(); return; }
		if (!settings().url) { toast('configure o webhook do n8n em ⚙ para pedir ajustes.', 'error'); return; }
		var btn = $('reviseBtn');
		btn.disabled = true;
		btn.textContent = 'ajustando…';
		$('md').readOnly = true;
		var before = state.md;
		post('revise', { markdown: state.md, instruction: instruction }).then(function (md) {
			state.prev = before;
			$('undoBtn').classList.remove('hidden');
			state.md = md;
			$('md').value = md;
			renderPreview();
			saveDraft(true);
			$('reviseInput').value = '';
			toast('ajuste aplicado. “desfazer ajuste” volta ao texto anterior.');
		}, function (e) {
			toast(e.message, 'error');
		}).then(function () {
			btn.disabled = false;
			btn.textContent = 'pedir ajuste';
			$('md').readOnly = false;
		});
	}

	// --------------------------------------------------------- exportar ----
	function fileBase() { return slug(state.ficha.name); }

	function exportMd() {
		download(new Blob([state.md], { type: 'text/markdown;charset=utf-8' }), fileBase() + '.md');
	}

	function exportZip() {
		if (!window.JSZip) { exportMd(); return; }
		var zip = new window.JSZip();
		zip.file(fileBase() + '.md', state.md);
		var used = state.md;
		var flat = { createFolders: false }; // sem entrada vazia para a pasta
		if (state.preview && used.indexOf('imagens/preview.') >= 0) zip.file('imagens/preview.' + extOf(state.preview.blob), state.preview.blob, flat);
		state.shots.forEach(function (s) { if (used.indexOf('imagens/' + s.name) >= 0) zip.file('imagens/' + s.name, s.blob, flat); });
		zip.generateAsync({ type: 'blob' }).then(function (b) { download(b, fileBase() + '.zip'); });
	}

	// ------------------------------------------------------------- bind ----
	function bindDrop(el, input, onFiles) {
		el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
		el.addEventListener('dragleave', function () { el.classList.remove('over'); });
		el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('over'); onFiles(e.dataTransfer.files); });
		el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
		input.addEventListener('change', function () { onFiles(input.files); input.value = ''; });
	}

	function bind() {
		bindDrop($('packDrop'), $('packInput'), function (files) { loadPackFile(files[0]); });
		bindDrop($('shotDrop'), $('shotInput'), addShots);
		$('swapPack').onclick = function () { $('packInput').click(); };
		document.addEventListener('dragover', function (e) { e.preventDefault(); });
		document.addEventListener('drop', function (e) {
			e.preventDefault();
			if (document.body.dataset.phase !== 'upload') return;
			var files = e.dataTransfer.files;
			if (files.length === 1 && /\.json$/i.test(files[0].name)) loadPackFile(files[0]);
			else addShots(files);
		});
		document.addEventListener('paste', function (e) {
			if (document.body.dataset.phase !== 'upload') return;
			var files = [];
			Array.prototype.forEach.call((e.clipboardData && e.clipboardData.items) || [], function (it) {
				if (it.kind === 'file' && /^image\//.test(it.type)) files.push(it.getAsFile());
			});
			if (files.length) { e.preventDefault(); addShots(files); }
		});

		$('shots').addEventListener('input', function (e) {
			var id = +e.target.dataset.cap;
			state.shots.forEach(function (s) { if (s.id === id) s.caption = e.target.value; });
		});
		$('shots').addEventListener('click', function (e) {
			var id = +(e.target.dataset && e.target.dataset.rm);
			if (!id) return;
			state.shots = state.shots.filter(function (s) { if (s.id === id) URL.revokeObjectURL(s.url); return s.id !== id; });
			renumber();
			renderShots();
		});

		$('sendBtn').onclick = sendDraft;
		$('localBtn').onclick = function () {
			var saved = loadDraft();
			openReview(saved ? saved.md : localDraft());
		};
		$('cancelBtn').onclick = function () { if (state.controller) state.controller.abort(); };
		$('backBtn').onclick = function () { renderPack(); phase('upload'); };
		$('md').addEventListener('input', function () { state.md = $('md').value; renderPreview(); saveDraft(false); });
		$('reviseForm').addEventListener('submit', revise);
		$('copyBtn').onclick = function () {
			(navigator.clipboard ? navigator.clipboard.writeText(state.md) : Promise.reject()).then(function () { toast('markdown copiado.'); }, function () { $('md').select(); toast('use Ctrl+C para copiar.'); });
		};
		$('mdBtn').onclick = exportMd;
		$('undoBtn').onclick = function () {
			if (state.prev === undefined) return;
			var cur = state.md;
			state.md = state.prev;
			state.prev = cur; // clicar de novo refaz
			$('md').value = state.md;
			renderPreview();
			saveDraft(true);
			$('undoBtn').textContent = $('undoBtn').textContent === 'desfazer ajuste' ? 'refazer ajuste' : 'desfazer ajuste';
		};
		$('zipBtn').onclick = exportZip;

		$('settingsBtn').onclick = function () {
			var s = settings();
			$('cfgUrl').value = s.url; $('cfgHealth').value = s.health; $('cfgToken').value = s.token;
			$('settings').showModal();
		};
		$('settings').addEventListener('close', function () {
			if ($('settings').returnValue !== 'save') return;
			try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ url: $('cfgUrl').value.trim(), health: $('cfgHealth').value.trim(), token: $('cfgToken').value })); } catch (e) { }
			checkHealth();
			toast('configurações salvas.');
		});

		document.addEventListener('keydown', function (e) {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.body.dataset.phase === 'upload' && !$('sendBtn').disabled) sendDraft();
			if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && document.body.dataset.phase === 'review') { e.preventDefault(); exportZip(); }
		});

		checkHealth();
		setInterval(checkHealth, CONFIG.HEALTH_INTERVAL_MS);
	}

	window.BINDOCS_API = { loadPack: loadPack, localDraft: function () { return localDraft(); } };
	bind();
})();
