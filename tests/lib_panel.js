// Utilidades comuns para abrir o painel no Chromium com o host.jsx rodando no After Effects simulado.
'use strict';
const path = require('path');
const fs = require('fs');
const { createContext, loadHost } = require('./ae_mock');
const scene = require('./scene');

const ROOT = path.resolve(__dirname, '..');
const LOGO = fs.readFileSync(path.join(ROOT, 'docs/img/logo.png')).toString('base64');

// cria o projeto de exemplo e liga o painel (page) a ele
async function setup(page, settings) {
	const ctx = createContext();
	loadHost(ctx, path.join(ROOT, 'bin-cep/jsx/host.jsx'));
	const comp = scene(ctx);
	await page.exposeFunction('__host', (fn, args) => {
		if (typeof ctx[fn] !== 'function') return JSON.stringify({ error: 'função inexistente: ' + fn });
		return ctx[fn].apply(null, args);
	});
	// como no CEP (--enable-nodejs + --mixed-context): a página tem 'module' e 'require' do Node
	await page.addInitScript(() => {
		window.module = { exports: {} };
		window.require = (m) => { throw new Error('require("' + m + '") não disponível no teste'); };
	});
	await page.addInitScript(({ settings, LOGO }) => {
		// só na primeira carga: recarregar a página mantém o que o painel salvou (ex.: a última aba)
		try { if (!localStorage.getItem('bin.settings')) localStorage.setItem('bin.settings', JSON.stringify(settings)); } catch (e) { }
		window.__saved = {};
		window.BIN_MOCK = {
			callHost: (fn, args) => window.__host(fn, args),
			openFiles: () => ['/projetos/abertura/logo.png'],
			readBinary: () => Uint8Array.from(atob(LOGO), (c) => c.charCodeAt(0)),
			saveFile: (t, name) => '/projetos/abertura/' + name,
			writeText: (p, t) => { window.__saved[p] = t; }
		};
	}, { settings: Object.assign({ theme: 'dark', mode: 'layers' }, settings || {}), LOGO });
	return { ctx, comp, select: (names) => comp._layers.forEach((l) => { l.selected = names.indexOf(l.name) >= 0; }) };
}

const url = 'file://' + path.join(ROOT, 'bin-cep/index.html');

// destaques no mesmo estilo da documentação do ABRIDOR: contorno roxo e número
async function annotate(page, marks) {
	await page.evaluate((marks) => {
		marks.forEach((m) => {
			const el = document.querySelectorAll(m.sel)[m.i || 0];
			if (!el) { console.warn('sem alvo: ' + m.sel); return; }
			const r = el.getBoundingClientRect();
			const pad = m.pad === undefined ? 3 : m.pad;
			if (m.box !== false) {
				const b = document.createElement('div');
				b.className = '__mark';
				Object.assign(b.style, {
					position: 'fixed', left: (r.left - pad) + 'px', top: (r.top - pad) + 'px',
					width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px',
					border: '2px solid #b44dff', borderRadius: (m.radius || 9) + 'px', boxShadow: '0 0 0 3px rgba(136,0,248,.25)',
					zIndex: 9998, pointerEvents: 'none'
				});
				document.body.appendChild(b);
			}
			const n = document.createElement('div');
			n.className = '__mark';
			n.textContent = m.n;
			const side = m.side || 'right';
			let x = side === 'right' ? r.right + pad - 4 : side === 'left' ? r.left - pad - 18 : r.left + r.width / 2 - 11;
			let y = side === 'top' ? r.top - pad - 18 : side === 'bottom' ? r.bottom + pad - 4 : r.top - pad - 9;
			x = Math.max(2, Math.min(window.innerWidth - 24, x));
			y = Math.max(2, y);
			Object.assign(n.style, {
				position: 'fixed', left: x + 'px', top: y + 'px', width: '22px', height: '22px', borderRadius: '50%',
				background: '#8800f8', color: '#fff', font: '700 12px/22px Inter, "Segoe UI", sans-serif', textAlign: 'center',
				zIndex: 9999, boxShadow: '0 1px 4px rgba(0,0,0,.6)', pointerEvents: 'none'
			});
			document.body.appendChild(n);
		});
	}, marks);
}

async function clearMarks(page) {
	await page.evaluate(() => document.querySelectorAll('.__mark').forEach((e) => e.remove()));
}

module.exports = { setup, url, annotate, clearMarks, ROOT };
