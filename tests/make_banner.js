// Gera o banner (360 x 84) do instalador e grava como string binária dentro do INSTALAR O BIN.jsx.
// uso: node tests/make_banner.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const CG = require('../bin-cep/js/codegen.js');

const GLYPH = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M6.5 6.5 1.8 12l4.7 5.5M17.5 6.5l4.7 5.5-4.7 5.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.2 16.8 12 12 16.8 7.2 12z" fill="#fff"/><path d="M12 4.2v2M12 17.8v2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></svg>';

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	await page.setContent(`<body style="margin:0"><div id="b" style="width:360px;height:84px;background:#18191b;display:flex;align-items:center;gap:14px;padding:0 22px;box-sizing:border-box;font-family:'Segoe UI',Inter,Arial,sans-serif;position:relative;overflow:hidden">
		<div style="position:absolute;right:-40px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(143,124,255,.22),transparent 65%)"></div>
		<div style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,#4c9dff,#8f7cff);box-shadow:0 6px 18px rgba(76,157,255,.4)">${GLYPH}</div>
		<div style="display:flex;flex-direction:column;gap:2px;position:relative">
			<b style="color:#eceef1;font-size:16px;letter-spacing:4px">BIN</b>
			<span style="color:#9aa0a8;font-size:11.5px">engenharia reversa de layer · After Effects</span>
		</div></div></body>`);
	const buf = await (await page.$('#b')).screenshot();
	await browser.close();
	fs.writeFileSync(path.join(__dirname, 'out', 'banner.png'), buf);

	const file = path.join(__dirname, '..', 'INSTALAR O BIN.jsx');
	let src = fs.readFileSync(file, 'utf8');
	src = src.replace(/\tvar BANNER = '.*';\n/, () => '\tvar BANNER = ' + CG.binaryString(buf) + ';\n');
	fs.writeFileSync(file, src);
	console.log('banner: ' + buf.length + ' bytes');
})();
