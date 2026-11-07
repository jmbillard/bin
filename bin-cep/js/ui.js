/*
 * BIN - ícones e utilitários de interface
 *
 * - ícones em SVG (traço, 24x24) gerados como string
 * - dicas (tooltips) próprias: o title nativo nem sempre aparece no CEP
 * - toasts
 */
(function (global) {
	'use strict';

	var BIN = global.BIN = global.BIN || {};
	var UI = BIN.ui = {};

	// ------------------------------------------------------------ ícones ---
	var P = {
		layers: '<path d="M12 3 21 8l-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/>',
		code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
		tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
		swap: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
		help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
		moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
		themeAuto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
		search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
		chevron: '<path d="m6 9 6 6 6-6"/>',
		key: '<path d="m12 3.5 7 8.5-7 8.5-7-8.5z"/>',
		expr: '<path d="M8 4H6v16h2"/><path d="M16 4h2v16h-2"/><path d="M10 12h4"/>',
		expand: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
		collapse: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
		sparkle: '<path d="M12 3c.6 4.2 2.3 6.4 6.5 7-4.2.6-5.9 2.8-6.5 7-.6-4.2-2.3-6.4-6.5-7 4.2-.6 5.9-2.8 6.5-7z"/><path d="M19 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z"/>',
		check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
		x: '<path d="M6 6l12 12M18 6 6 18"/>',
		alert: '<path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
		copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
		save: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/>',
		wrap: '<path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4"/><path d="M3 18h6"/><path d="m14 15-3 3 3 3"/>',
		target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
		binary: '<rect x="4" y="3" width="6" height="8" rx="3"/><path d="M15 3v8M13.5 4.5 15 3"/><rect x="14" y="13" width="6" height="8" rx="3"/><path d="M6 13v8M4.5 14.5 6 13"/>',
		undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
		move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
		shape: '<rect x="3" y="3" width="10" height="10" rx="1.5"/><circle cx="15.5" cy="15.5" r="5.5"/>',
		fx: '<path d="m4 20 11-11"/><path d="m13.5 7.5 3 3"/><path d="M18 2.5v3M16.5 4h3M20 10v2M19 11h2M9 3v2M8 4h2"/>',
		mask: '<path d="M5 5h14v14H5z" stroke-dasharray="3 2.2"/><circle cx="12" cy="12" r="4"/>',
		text: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
		marker: '<path d="M6 3h12v18l-6-4-6 4z"/>',
		attrs: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
		camera: '<rect x="2.5" y="6" width="14" height="12" rx="2"/><path d="m16.5 10 5-3v10l-5-3"/>',
		light: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		audio: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
		cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
		file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
		upload: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-6"/><path d="M9.5 13.5 12 11l2.5 2.5"/>',
		trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
		link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
	};

	// marca do BIN: layer (losango) entre chaves
	UI.logo = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 1.8 12l4.7 5.5M17.5 6.5l4.7 5.5-4.7 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path class="logo-layer" d="M12 7.2 16.8 12 12 16.8 7.2 12z" fill="currentColor"/><path d="M12 4.2v2M12 17.8v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></svg>';

	UI.icon = function (name, cls) {
		return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || '') + '</svg>';
	};

	// substitui <i data-icon="nome"></i> pelo SVG
	UI.hydrateIcons = function (root) {
		Array.prototype.forEach.call((root || document).querySelectorAll('i[data-icon]'), function (i) {
			var wrap = document.createElement('span');
			wrap.innerHTML = UI.icon(i.dataset.icon, i.className);
			i.parentNode.replaceChild(wrap.firstChild, i);
		});
	};

	UI.esc = function (s) {
		return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
	};

	UI.reduced = function () {
		return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
	};

	// ------------------------------------------------------------ dicas ----
	// qualquer elemento com title vira dica própria; a 1ª linha fica em destaque
	UI.tooltips = function () {
		var tip = document.createElement('div');
		tip.className = 'tip';
		document.body.appendChild(tip);
		var timer = null, current = null;

		function hide() { clearTimeout(timer); tip.classList.remove('show'); current = null; }
		function show(el) {
			var text = el.dataset.tip;
			if (!text) return;
			var lines = text.split('\n');
			tip.innerHTML = '<b>' + UI.esc(lines[0]) + '</b>' + (lines.length > 1 ? '<span>' + lines.slice(1).map(UI.esc).join('<br>') + '</span>' : '');
			tip.style.left = '0px'; tip.style.top = '0px';
			tip.classList.add('show');
			var r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
			var x = Math.max(8, Math.min(global.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
			var y = r.bottom + 6;
			if (y + t.height > global.innerHeight - 6) y = r.top - t.height - 6;
			tip.style.left = x + 'px';
			tip.style.top = y + 'px';
		}

		document.addEventListener('mouseover', function (e) {
			var el = e.target.closest ? e.target.closest('[title],[data-tip]') : null;
			if (el && el.hasAttribute('title')) {
				el.dataset.tip = el.getAttribute('title');
				el.removeAttribute('title');
			}
			if (el === current) return;
			hide();
			if (!el) return;
			current = el;
			timer = setTimeout(function () { if (current === el) show(el); }, 450);
		});
		document.addEventListener('mousedown', hide);
		document.addEventListener('wheel', hide, true);
	};

	// atualiza o texto de uma dica (inclusive a que está aberta)
	UI.setTip = function (el, text) {
		el.removeAttribute('title');
		el.dataset.tip = text;
	};

	// ------------------------------------------------------------ toast ----
	var toastTimer = null;

	// actions: [{ label, icon, run }]
	UI.toast = function (msg, kind, opts) {
		opts = opts || {};
		var t = document.getElementById('toast');
		clearTimeout(toastTimer);
		t.className = 'toast ' + (kind || 'info');
		var icon = { ok: 'check', error: 'alert', warn: 'alert', info: 'info' }[kind || 'info'];
		var html = '<div class="toast-msg">' + UI.icon(icon) + '<span>' + msg + '</span><button class="toast-x" title="fechar">' + UI.icon('x') + '</button></div>';
		if (opts.details && opts.details.length) {
			html += '<ul class="toast-list">' + opts.details.map(function (d) { return '<li>' + UI.esc(d) + '</li>'; }).join('') + '</ul>';
		}
		if (opts.actions && opts.actions.length) {
			html += '<div class="toast-acts">' + opts.actions.map(function (a, i) {
				return '<button class="btn small" data-i="' + i + '">' + (a.icon ? UI.icon(a.icon) : '') + a.label + '</button>';
			}).join('') + '</div>';
		}
		t.innerHTML = html;
		t.querySelector('.toast-x').onclick = UI.hideToast;
		Array.prototype.forEach.call(t.querySelectorAll('.toast-acts button'), function (b) {
			b.onclick = function () { opts.actions[+b.dataset.i].run(); };
		});
		void t.offsetHeight;
		t.classList.add('show');
		if (!opts.sticky) toastTimer = setTimeout(UI.hideToast, opts.life || 3200);
	};

	UI.hideToast = function () {
		clearTimeout(toastTimer);
		document.getElementById('toast').classList.remove('show');
	};
})(window);
