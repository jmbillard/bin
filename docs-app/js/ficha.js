/*
 * ficha técnica de um template, a partir do pacote exportado pelo BIN (bin-doc-pack).
 *
 * O agente recebe essa ficha no lugar do script inteiro: é menor, legível e já liga cada
 * controle de expressão às propriedades que ele afeta (lendo as expressões).
 * Não depende do DOM: roda na página e no Node (testes).
 */
(function (root) {
	'use strict';

	var F = {};

	// controles de expressão nativos (matchName → tipo)
	var CONTROLS = {
		'ADBE Slider Control': 'slider',
		'ADBE Checkbox Control': 'checkbox',
		'ADBE Color Control': 'cor',
		'ADBE Point Control': 'ponto',
		'ADBE Point3D Control': 'ponto 3D',
		'ADBE Angle Control': 'ângulo',
		'ADBE Layer Control': 'layer',
		'ADBE Dropdown Control': 'menu'
	};
	var TYPE_NAME = { shape: 'shape', text: 'texto', solid: 'solid', adjustment: 'adjustment', null: 'null', camera: 'câmera', light: 'luz', precomp: 'precomp', footage: 'mídia' };
	var CASE_NAME = { upperCase: 'CAIXA ALTA', lowerCase: 'caixa baixa', titleCase: 'Título', freeCase: 'livre' };

	function num(n) {
		if (typeof n !== 'number') return String(n);
		var r = Math.round(n * 1000) / 1000;
		return String(r === 0 ? 0 : r);
	}

	function fmt(v) {
		if (v === undefined || v === null) return '—';
		if (typeof v === 'boolean') return v ? 'sim' : 'não';
		if (typeof v === 'number') return num(v);
		if (typeof v === 'string') return '"' + v + '"';
		if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
		if (v.e) return v.e.split('.')[1].toLowerCase().replace(/_/g, ' ');
		if (v.shape) return 'path (' + v.shape.v.length + ' pontos)';
		if (v.doc) return '"' + String(v.doc.text).replace(/\r/g, ' / ') + '"';
		return '{…}';
	}

	function color(v) {
		if (!Array.isArray(v)) return fmt(v);
		return '#' + v.slice(0, 3).map(function (x) { var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16); return h.length < 2 ? '0' + h : h; }).join('').toUpperCase();
	}

	function time(t, fps) {
		var s = Math.floor(t + 1e-6), f = Math.round((t - s) * (fps || 30));
		var m = Math.floor(s / 60);
		s = s % 60;
		return m + ':' + (s < 10 ? '0' : '') + s + (f ? ':' + (f < 10 ? '0' : '') + f : '');
	}

	// percorre as propriedades de uma layer: cb(nó, caminho)
	function walk(nodes, path, cb) {
		nodes.forEach(function (n) {
			var p = path.concat(n.name);
			cb(n, p);
			if (n.kids) walk(n.kids, p, cb);
		});
	}

	function textOf(L) {
		var out = null;
		walk(L.groups, [], function (n) {
			if (n.mn === 'ADBE Text Document' && !out) {
				var v = n.v || (n.keys && n.keys[0].v);
				if (v && v.doc) out = v.doc;
			}
		});
		return out;
	}

	function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

	// comps da captura, com a principal primeiro
	function comps(pack) {
		var c = pack.capture;
		if (c.mode === 'comp') {
			var root = c.comps.filter(function (C) { return C.id === c.root; })[0];
			return [root].concat(c.comps.filter(function (C) { return C !== root; }).reverse());
		}
		var one = Object.assign({}, c.comp, { layers: c.layers, partial: true });
		return [one];
	}

	F.build = function (pack) {
		if (!pack || pack.format !== 'bin-doc-pack') throw new Error('arquivo não é um pacote de documentação do BIN.');
		var list = comps(pack);
		var main = list[0];
		var fps = main.frameRate;
		var cfg = (pack.template && pack.template.config) || null;

		var data = { name: (cfg && cfg.configName) || main.name, comp: main.name, controls: [], expressions: [], texts: [], media: [], precomps: [], editable: [], warnings: [] };

		// expressões e controles de todas as comps
		list.forEach(function (C) {
			C.layers.forEach(function (L) {
				walk(L.groups, [], function (n, p) {
					if (n.fx && CONTROLS[n.mn]) {
						var leaf = (n.kids || []).filter(function (k) { return k.k === 'p' && !/Built In/.test(k.mn); })[0];
						var v = leaf ? (leaf.keys ? leaf.keys[0].v : leaf.v) : undefined;
						data.controls.push({
							comp: C.name, layer: L.name, name: n.name, type: CONTROLS[n.mn],
							value: CONTROLS[n.mn] === 'cor' ? color(v) : fmt(v === undefined ? 'padrão' : v),
							animated: !!(leaf && leaf.keys), off: !!n.off, affects: []
						});
					}
					if (n.k === 'p' && n.x) data.expressions.push({ comp: C.name, layer: L.name, path: p.join(' › '), code: n.x, off: !!n.xoff });
				});
				var doc = L.type === 'text' ? textOf(L) : null;
				if (doc) data.texts.push({ comp: C.name, layer: L.name, index: L.index, text: doc.text, font: doc.font, size: doc.fontSize, box: !!doc.boxText });
				if (L.type === 'footage' && L.source) data.media.push({ comp: C.name, layer: L.name, source: L.source.name, file: L.source.file || '' });
				if (L.type === 'precomp' && L.source) data.precomps.push({ comp: C.name, layer: L.name, source: L.source.name });
			});
		});

		// liga cada controle às expressões que o usam: effect("nome") na própria layer do controle,
		// ou layer("layer do controle") + effect("nome") em outra layer da mesma comp
		data.controls.forEach(function (ctl) {
			var byName = new RegExp('effect\\(\\s*["\']' + escRe(ctl.name) + '["\']\\s*\\)');
			data.expressions.forEach(function (x) {
				if (!byName.test(x.code)) return;
				var sameLayer = x.layer === ctl.layer && x.comp === ctl.comp;
				var refLayer = new RegExp('layer\\(\\s*["\']' + escRe(ctl.layer) + '["\']\\s*\\)').test(x.code);
				if (sameLayer || (refLayer && x.comp === ctl.comp)) ctl.affects.push(x.layer + ' › ' + x.path);
			});
		});

		// layers editáveis do config
		if (cfg && Array.isArray(cfg.inputLayers)) {
			cfg.inputLayers.forEach(function (il, i) {
				var L = main.layers.filter(function (l) { return l.index === il.layerIndex; })[0];
				var doc = L ? textOf(L) : null;
				data.editable.push({
					order: i + 1, index: il.layerIndex, layer: L ? L.name : '(layer ' + il.layerIndex + ' não encontrada na captura)',
					method: il.method === 'layerName' ? 'nome do layer' : 'conteúdo do texto', current: doc ? doc.text : (L ? L.name : '')
				});
				if (!L) data.warnings.push('o config aponta para a layer ' + il.layerIndex + ', que não está na captura.');
			});
		}
		if (!cfg) data.warnings.push('sem _config.json: a comp não parece ser um template do padeiro (ou o pacote foi gerado com a comp fora da pasta do template).');
		if (pack.capture.mode !== 'comp') data.warnings.push('o pacote tem só as layers selecionadas, não a comp inteira: use "comp inteira" no BIN para uma documentação completa.');

		data.text = F.text(pack, data, list, cfg, fps);
		return data;
	};

	// ficha em texto (markdown simples) para o agente e para a tela
	F.text = function (pack, data, list, cfg, fps) {
		var main = list[0];
		var s = main.settings || {};
		var out = [];
		var line = function (t) { out.push(t); };

		line('# ficha técnica · ' + data.name);
		line('');
		line('## comp principal');
		line('- nome: ' + main.name);
		line('- tamanho: ' + main.width + ' × ' + main.height + ' · ' + num(main.frameRate) + ' fps · duração ' + time(main.duration, fps));
		if (s.workAreaDuration !== undefined && Math.abs(s.workAreaDuration - main.duration) > 1e-3) line('- work area: ' + time(s.workAreaStart || 0, fps) + ' → ' + time((s.workAreaStart || 0) + s.workAreaDuration, fps));
		line('- layers: ' + main.layers.length + (list.length > 1 ? ' · precomps: ' + (list.length - 1) : ''));
		if (main.markers && main.markers.length) line('- markers da comp: ' + main.markers.map(function (m) { return time(m.t, fps) + (m.comment ? ' "' + m.comment + '"' : ''); }).join(', '));

		if (cfg) {
			line('');
			line('## configuração do padeiro (_config.json)');
			line('- nome da configuração: ' + cfg.configName);
			if (cfg.prefix) line('- prefixo das comps: ' + cfg.prefix);
			line('- caixa de texto: ' + (CASE_NAME[cfg.textCase] || cfg.textCase));
			line('- separador: ' + JSON.stringify(cfg.separator));
			if (cfg.refTime !== undefined) line('- tempo de referência: ' + cfg.refTime + ' s');
			if (cfg.exemple) line('- exemplo de preenchimento:\n```\n' + String(cfg.exemple).replace(/\\n/g, '\n') + '\n```');
			if (cfg.tip) line('- dicas atuais:\n```\n' + String(cfg.tip) + '\n```');
			if (cfg.inputFx && cfg.inputFx.fxName) line('- variações de layout: controle "' + cfg.inputFx.fxName + '" (layer ' + cfg.inputFx.layerIndex + '), opções ' + (cfg.inputFx.options || []).join(', ') + ': cada preenchimento gera uma comp por opção.');
			if (cfg.outputPath && cfg.outputPath.length) line('- pastas de output: ' + cfg.outputPath.length);
			if (pack.template.script) line('- o template tem _script.js (roda depois do preenchimento).');
		}
		if (pack.template && pack.template.fonts && pack.template.fonts.length) line('- fontes na pasta FONTS: ' + pack.template.fonts.join(', '));

		if (data.editable.length) {
			line('');
			line('## layers preenchidos pelo padeiro (ordem do input)');
			data.editable.forEach(function (e) { line(e.order + '. ' + e.layer + ' (layer ' + e.index + ', ' + e.method + ') · hoje: ' + JSON.stringify(String(e.current).replace(/\r/g, '\n'))); });
		}

		line('');
		line('## controles de expressão');
		if (!data.controls.length) line('- nenhum controle de expressão.');
		data.controls.forEach(function (c) {
			line('- **' + c.name + '** (' + c.type + ') no layer "' + c.layer + '"' + (list.length > 1 ? ' da comp "' + c.comp + '"' : '') + ' · valor: ' + c.value + (c.animated ? ' (animado)' : '') + (c.off ? ' · efeito desligado' : ''));
			if (c.affects.length) c.affects.forEach(function (a) { line('  - usado por: ' + a); });
			else line('  - nenhuma expressão usa este controle pelo nome.');
		});

		line('');
		line('## expressões');
		if (!data.expressions.length) line('- nenhuma expressão.');
		data.expressions.forEach(function (x) {
			line('- ' + x.layer + ' › ' + x.path + (list.length > 1 ? ' (comp "' + x.comp + '")' : '') + (x.off ? ' · desligada' : '') + ':');
			line('```js\n' + x.code + '\n```');
		});

		line('');
		line('## layers da comp principal (de cima para baixo)');
		main.layers.forEach(function (L) {
			var bits = [TYPE_NAME[L.type] || L.type];
			if (L.parent) bits.push('parent: ' + L.parent.name);
			if (L.matte) bits.push('track matte: ' + fmt(L.matte.type) + ' de ' + L.matte.name);
			if (L.attrs && L.attrs.guideLayer) bits.push('guia');
			if (L.attrs && L.attrs.enabled === false) bits.push('invisível');
			line(L.index + '. ' + L.name + ' · ' + bits.join(' · '));
		});

		if (data.texts.length) {
			line('');
			line('## textos');
			data.texts.forEach(function (t) { line('- ' + t.layer + (list.length > 1 ? ' (comp "' + t.comp + '")' : '') + ': ' + JSON.stringify(String(t.text).replace(/\r/g, '\n')) + ' · ' + t.font + ' ' + num(t.size) + ' pt' + (t.box ? ' · caixa de texto' : '')); });
		}
		if (data.precomps.length) {
			line('');
			line('## precomps');
			data.precomps.forEach(function (p) { line('- ' + p.layer + ' → comp "' + p.source + '" (dentro de "' + p.comp + '")'); });
		}
		if (data.media.length) {
			line('');
			line('## mídias (footage)');
			data.media.forEach(function (m) { line('- ' + m.layer + ' → ' + m.source + (m.file ? ' (' + m.file + ')' : '')); });
		}
		if (data.warnings.length) {
			line('');
			line('## avisos');
			data.warnings.forEach(function (w) { line('- ' + w); });
		}
		return out.join('\n');
	};

	// registra nos dois lugares (uma página com Node integrado também tem 'module')
	if (typeof window !== 'undefined') window.Ficha = F;
	if (typeof module !== 'undefined' && module.exports) module.exports = F;
})(typeof window !== 'undefined' ? window : this);
