// Ponte com o CEP: caminho da extensão, recarga do host.jsx (versão sempre igual à do painel),
// teclas reservadas para o painel (⌘ + Enter não abre o Quick Apply do AE) e assinatura da versão.
// uso: node tests/cep_bridge.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = false;
const check = (ok, label) => { console.log((ok ? 'ok    ' : 'FALHA ') + label); if (!ok) failed = true; };
const SRC = fs.readFileSync(path.join(__dirname, '../bin-cep/js/cep.js'), 'utf8');

function load(sysPath, platform) {
	const calls = { eval: [], keys: null };
	const g = {
		navigator: { platform },
		require: require,
		__adobe_cep__: {
			getSystemPath: () => sysPath,
			evalScript: (s, cb) => { calls.eval.push(s); cb('ok'); },
			registerKeyEventsInterest: (j) => { calls.keys = JSON.parse(j); }
		}
	};
	g.window = g;
	vm.runInNewContext(SRC, g);
	return { BIN: g.BIN, calls };
}

(async () => {
	// macOS
	let { BIN, calls } = load('file:///Library/Application%20Support/Adobe/CEP/extensions/com.jmbillard.bin', 'MacIntel');
	check(BIN.extPath() === '/Library/Application Support/Adobe/CEP/extensions/com.jmbillard.bin', 'mac: caminho da extensão (espaços decodificados)');
	check(await BIN.reloadHost() && /\$\.evalFile\(File\('\/Library\/Application Support\/Adobe\/CEP\/extensions\/com\.jmbillard\.bin\/jsx\/host\.jsx'\)\)/.test(calls.eval[0]), 'recarrega o host.jsx da pasta da extensão');
	check(BIN.claimKeys() && calls.keys.some((k) => k.keyCode === 36 && k.metaKey && !k.ctrlKey) && calls.keys.some((k) => k.keyCode === 36 && k.ctrlKey), 'mac: ⌘ + Enter (e ⌃ + Enter) reservados para o painel');
	check(calls.keys.some((k) => k.keyCode === 8 && k.metaKey && k.shiftKey) && calls.keys.every((k) => k.metaKey || k.ctrlKey), 'mac: ⌘ + Shift + C reservado; nenhuma tecla sem modificador');

	// Windows
	({ BIN, calls } = load('file:///C:/Program%20Files%20(x86)/Common%20Files/Adobe/CEP/extensions/com.jmbillard.bin', 'Win32'));
	check(BIN.extPath() === 'C:/Program Files (x86)/Common Files/Adobe/CEP/extensions/com.jmbillard.bin', 'windows: caminho com a letra do disco');
	check(BIN.claimKeys() && calls.keys.some((k) => k.keyCode === 13 && k.ctrlKey) && !calls.keys.some((k) => k.metaKey), 'windows: Ctrl + Enter reservado');

	// fora do CEP: nada quebra
	const g = { navigator: { platform: 'Linux' } }; g.window = g;
	vm.runInNewContext(SRC, g);
	check(g.BIN.extPath() === null && g.BIN.claimKeys() === false && (await g.BIN.reloadHost()) === false && g.BIN.localStamp() === null, 'fora do CEP: sem caminho, sem recarga, sem erro');

	// assinatura: estável e muda quando um arquivo muda
	const dir = path.join(__dirname, '../bin-cep');
	const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
	const a = BIN.stamp(read), b = BIN.stamp(read), c = BIN.stamp((f) => read(f) + (f === 'jsx/host.jsx' ? ' ' : ''));
	const crlf = BIN.stamp((f) => read(f).replace(/\n/g, '\r\n'));
	check(/^[0-9a-f]{8}$/.test(a) && a === b && a !== c && a === crlf, 'assinatura: 8 dígitos, estável, muda com o host, igual com quebras de linha do Windows');
	// nome de exibição: o mesmo no manifest (instalador) e no código (painel, script gerado)
	const manifest = fs.readFileSync(path.join(__dirname, '../bin-cep/CSXS/manifest.xml'), 'utf8');
	const name = (manifest.match(/ExtensionBundleName="([^"]+)"/) || [])[1];
	const CG = require('../bin-cep/js/codegen.js');
	const html = fs.readFileSync(path.join(__dirname, '../bin-cep/index.html'), 'utf8');
	check(name === 'BIN v3 beta 1' && CG.NAME === name && html.indexOf('title="' + name + '&#10;') >= 0, 'nome “' + name + '” igual no manifest, no código e no HTML');
	process.exit(failed ? 1 : 0);
})();
