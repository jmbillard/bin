/*
 * BIN - ponte entre o painel (HTML/JS) e o After Effects (ExtendScript)
 * Usa a API nativa window.__adobe_cep__ (a mesma usada pelo CSInterface.js)
 * e o Node.js embutido no CEP para acesso a arquivos.
 *
 * Fora do After Effects (teste no navegador) é possível injetar
 * window.BIN_MOCK com as mesmas funções.
 */
(function (global) {
	'use strict';

	var BIN = global.BIN = global.BIN || {};

	var cep = global.__adobe_cep__;
	var nodeRequire = typeof global.require === 'function' ? global.require : (typeof require === 'function' ? require : null);
	var fs = null, path = null, os = null;
	if (nodeRequire) {
		try {
			fs = nodeRequire('fs');
			path = nodeRequire('path');
			os = nodeRequire('os');
		} catch (e) { fs = null; }
	}
	var mock = function () { return global.BIN_MOCK || null; };

	BIN.isCEP = !!cep;
	BIN.hasFS = !!fs;

	// ---------------------------------------------------------------- host --
	var LS = new RegExp('\\u2028', 'g'), PS = new RegExp('\\u2029', 'g');

	function escapeForJSX(str) {
		return String(str)
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
			.replace(/\r/g, '\\r')
			.replace(/\n/g, '\\n')
			.replace(LS, '\\u2028')
			.replace(PS, '\\u2029');
	}

	// Executa uma função do host.jsx e devolve uma Promise com o retorno (string).
	BIN.callHost = function (fnName, args) {
		args = args || [];
		var call = fnName + '(' + args.map(function (a) {
			if (typeof a === 'number' || typeof a === 'boolean') return String(a);
			return "'" + escapeForJSX(a) + "'";
		}).join(',') + ')';

		return new Promise(function (resolve, reject) {
			if (cep) {
				cep.evalScript(call, function (res) {
					if (res === 'EvalScript error.') reject(new Error('erro no ExtendScript: ' + fnName));
					else resolve(res);
				});
			} else if (mock() && mock().callHost) {
				Promise.resolve(mock().callHost(fnName, args)).then(resolve, reject);
			} else {
				reject(new Error('After Effects não encontrado (painel fora do CEP).'));
			}
		});
	};

	// Chama o host e interpreta a resposta como JSON.
	BIN.callHostJSON = function (fnName, args) {
		return BIN.callHost(fnName, args).then(function (res) {
			var obj;
			try { obj = JSON.parse(res); } catch (e) {
				throw new Error('resposta inválida do After Effects: ' + String(res).slice(0, 300));
			}
			if (obj && obj.error) throw new Error(obj.error);
			return obj;
		});
	};

	// ----------------------------------------------------------------- fs --
	BIN.fs = {
		tmpFile: function (name) {
			if (!fs) return null;
			var dir = path.join(os.tmpdir(), 'BIN');
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			return path.join(dir, name);
		},
		basename: function (p) {
			return String(p).replace(/^.*[\\/]/, '');
		},
		readBinary: function (p) {
			if (fs) {
				var buf = fs.readFileSync(p);
				return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
			}
			if (mock() && mock().readBinary) return mock().readBinary(p);
			throw new Error('sem acesso ao sistema de arquivos.');
		},
		// UTF-8 com BOM: o ExtendScript lê os acentos certos em qualquer sistema
		writeText: function (p, text) {
			if (fs) { fs.writeFileSync(p, '﻿' + text, 'utf8'); return true; }
			if (mock() && mock().writeText) { mock().writeText(p, text); return true; }
			return false;
		}
	};

	// ------------------------------------------------------------ dialogs --
	function cepFs() { return global.cep && global.cep.fs; }

	BIN.dialog = {
		// lista de caminhos (ou [])
		openFiles: function (title) {
			if (cepFs() && cepFs().showOpenDialogEx) {
				var r = cepFs().showOpenDialogEx(true, false, title, '', []);
				return Promise.resolve(r && r.err === 0 && r.data ? r.data : []);
			}
			if (mock() && mock().openFiles) return Promise.resolve(mock().openFiles(title));
			return Promise.resolve([]);
		},
		// caminho para salvar (ou null)
		saveFile: function (title, defaultName) {
			if (cepFs() && cepFs().showSaveDialogEx) {
				var r = cepFs().showSaveDialogEx(title, '', ['jsx', 'jsxinc', 'txt'], defaultName);
				if (r && r.err === 0 && r.data) {
					var p = String(r.data);
					if (!/\.[a-z0-9]+$/i.test(p)) p += '.jsx';
					return Promise.resolve(p);
				}
				return Promise.resolve(null);
			}
			if (mock() && mock().saveFile) return Promise.resolve(mock().saveFile(title, defaultName));
			return Promise.resolve(null);
		}
	};

	// Copia texto (o clipboard assíncrono nem sempre existe no CEP).
	BIN.copy = function (text) {
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		var ok = false;
		try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
		document.body.removeChild(ta);
		if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
		}
		return Promise.resolve(ok);
	};

	// Abre um link no navegador do sistema.
	BIN.openURL = function (url) {
		if (global.cep && global.cep.util && global.cep.util.openURLInDefaultBrowser) global.cep.util.openURLInDefaultBrowser(url);
		else global.open(url, '_blank');
	};

	// Avisa quando o usuário muda o brilho da interface do After Effects.
	BIN.onHostThemeChange = function (cb) {
		if (!cep || !cep.addEventListener) return;
		try { cep.addEventListener('com.adobe.csxs.events.ThemeColorChanged', function () { cb(); }); } catch (e) { }
	};

	// Lê o tema do After Effects para ajustar as cores do painel.
	BIN.hostSkin = function () {
		if (!cep) return null;
		try {
			return JSON.parse(cep.getHostEnvironment()).appSkinInfo;
		} catch (e) { return null; }
	};
})(window);
