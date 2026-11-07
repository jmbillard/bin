<p align="center">
  <img src="docs/img/logo.png" width="72" alt="BIN">
</p>

# BIN

🗨️ **pt-BR** ⚡ extensão do After Effects para **engenharia reversa de layer** ⚡

O **BIN** lê as layers selecionadas na comp e gera um script **.jsx** que recria essas layers do zero, em qualquer projeto: propriedades, keyframes com easing e tangentes, expressões, efeitos, máscaras, shapes, textos, markers, parentesco e track matte.

Serve para transformar um layout pronto em ferramenta: o script gerado pode virar um botão de outro painel, um template ou um trecho de automação.

<p align="center">
  <img src="docs/img/02-propriedades.png" width="300" alt="aba propriedades">
  <img src="docs/img/03-codigo.png" width="300" alt="aba código">
</p>

> 📂 **arquivos:**\
> • **INSTALAR O BIN.jsx** → instalador (roda dentro do After Effects).\
> • **bin-cep/** → a extensão (painel CEP).\
> • **instalar_windows.bat** / **instalar_mac.command** → instaladores alternativos, sem abrir o After Effects.\
> • **bin.js** → versão anterior (script ScriptUI), mantida só como referência.

<br>

## 📑 índice

1. [instalar](#1--instalar)
2. [capturar uma layer](#2--capturar-uma-layer)
3. [escolher o que entra no script](#3--escolher-o-que-entra-no-script)
4. [o código gerado](#4--o-código-gerado)
5. [recriar, copiar e exportar](#5--recriar-copiar-e-exportar)
6. [utilitários](#6--utilitários)
7. [o que é recriado](#-o-que-é-recriado)
8. [para desenvolver](#-para-desenvolver)

<br>

---

## 1 · instalar

> ✅ **requisitos:** After Effects **2020 (17.0)** ou mais novo.

**1.1** no After Effects, abra `File` > `Scripts` > `Run Script File...` e escolha o **INSTALAR O BIN.jsx** direto da pasta do BIN (a pasta que tem a `bin-cep` dentro).

**1.2** o instalador confere o que é necessário. se a escrita de arquivos estiver bloqueada, use o link **› abrir preferências de scripts e expressões**, marque *Allow Scripts to Write Files and Access Network* e clique em **› verificar de novo**.

<table>
  <tr>
    <td align="center"><img src="docs/img/01-instalador-boas-vindas.png" width="380"><br><sub>1.1 · boas-vindas</sub></td>
    <td align="center"><img src="docs/img/02-instalador-checagem.png" width="380"><br><sub>1.2 · checagem</sub></td>
  </tr>
</table>

**1.3** escolha **instalar** (ou **atualizar** / **reinstalar**; **remover** desinstala) e **reinicie o After Effects**.

<table>
  <tr>
    <td align="center"><img src="docs/img/03-instalador-acao.png" width="380"><br><sub>1.3 · ação</sub></td>
    <td align="center"><img src="docs/img/04-instalador-concluido.png" width="380"><br><sub>1.3 · concluído</sub></td>
  </tr>
</table>

**1.4** abra o painel em `Window` > `Extensions` > `BIN`.

> 💡 sem abrir o After Effects: rode **instalar_windows.bat** (Windows) ou **instalar_mac.command** (macOS). os dois fazem a mesma cópia e liberam extensões sem assinatura (`PlayerDebugMode`).

<br>

---

## 2 · capturar uma layer

selecione uma ou mais layers na comp e clique em **capturar seleção** (ou no chip da layer, no topo, para capturar de novo depois).

<p align="center">
  <img src="docs/img/01-vazio.png" width="280" alt="painel vazio">
</p>

a captura é **somente leitura**: nada na layer original é alterado e o histórico de undo fica limpo.

o chip do topo mostra o tipo (`SHAPE`, `TEXT`, `SOLID`, `NULL`, `ADJ`, `CAM`, `LUZ`, `COMP`, `MÍDIA`), a comp de origem e quantas propriedades, keyframes e expressões foram encontradas.

<br>

---

## 3 · escolher o que entra no script

a aba **propriedades** mostra um card por grupo: atributos da layer, contents, transform, masks, effects, texto, markers…

- só aparecem as propriedades **modificadas** (diferentes do padrão, com keyframes ou com expressão);
- os **losangos** amarelos são keyframes; o **ƒ** violeta é uma expressão;
- a **caixa** de cada linha decide se ela entra no script. desmarcar um grupo tira o grupo inteiro (um efeito, uma máscara, um grupo de shape);
- **filtrar** procura pelo nome da propriedade ou do grupo;
- os botões **◇** e **[-]** ligam e desligam keyframes e expressões no script inteiro. sem keyframes, cada propriedade recebe o valor do primeiro keyframe.

com várias layers, cada uma ganha um cabeçalho com sua própria caixa.

<p align="center">
  <img src="docs/img/05-varias-layers.png" width="280" alt="várias layers">
  <img src="docs/img/08-claro.png" width="280" alt="tema claro">
</p>

<br>

---

## 4 · o código gerado

a aba **código** mostra o script com numeração de linhas. as funções auxiliares do BIN ficam recolhidas na prévia (clique para ver).

| opção | o que faz |
|---|---|
| **recriar em** | `comp ativa` usa a comp aberta quando o script roda. `nova comp` cria uma comp igual à de origem (tamanho, duração, fps e cor de fundo). |
| **envolver em função** | uma função `criar_nome_da_layer(comp)` por layer, fácil de reaproveitar. desligado, gera o código corrido. |
| **manter parentesco** | refaz parent e track matte. se o parent não foi capturado junto, o script procura uma layer com o mesmo nome na comp. |
| **comentários no código** | separa os blocos com comentários. |

o script gerado é **autônomo**: roda em `File` > `Scripts` > `Run Script File...` em qualquer projeto, sem o painel. ele traz um pequeno objeto `bin` com funções auxiliares que aplicam cada propriedade separadamente. se uma propriedade não existir na versão do After Effects de destino, ela é pulada e listada no final, sem derrubar o resto.

```js
function criar_titulo_principal(comp) {
	var layer = comp.layers.addShape();
	bin.attrs(layer, { name: 'TITULO_principal', label: 9 });

	// contents
	var contents = layer.property('ADBE Root Vectors Group');
	var barra = bin.add(contents, 'ADBE Vector Group', 'Barra');
	var rectanglePath1 = bin.add(barra.property('ADBE Vectors Group'), 'ADBE Vector Shape - Rect', 'Rectangle Path 1');
	bin.keys(rectanglePath1.property('ADBE Vector Rect Size'), [
		{ t: 0, v: [0, 120], i: 'BB', ei: [[0, 33], [0, 33]], eo: [[0, 75], [0, 75]] },
		{ t: 0.5338, v: [860, 120], i: 'BL' }
	]);

	// transform
	var transform = layer.property('ADBE Transform Group');
	bin.expr(transform.property('ADBE Rotate Z'), [
		'var amp = thisComp.layer("CONTROLE").effect("amp")("Slider");',
		'wiggle(2, amp);'
	].join('\n'));
	return layer;
}
```

<br>

---

## 5 · recriar, copiar e exportar

- **recriar layer** roda o script na hora, dentro de um único undo. o botão fica verde e o aviso oferece **desfazer** e **exportar .jsx**;
- **copiar** e **exportar** ficam na barra da aba código. o arquivo é salvo em UTF-8 com BOM, que o ExtendScript lê com acentos corretos em qualquer sistema;
- o selo **avisos** no rodapé lista o que pode dar diferença em outro computador: fontes, plug-ins de terceiros, footage e precomps (procurados no projeto pelo nome).

<p align="center">
  <img src="docs/img/04-recriada.png" width="280" alt="layer recriada">
  <img src="docs/img/06-avisos.png" width="280" alt="avisos">
</p>

<br>

---

## 6 · utilitários

<p align="center">
  <img src="docs/img/07-utilitarios.png" width="280" alt="utilitários">
</p>

- **expressão → string**: pega a expressão da propriedade selecionada (ou todas as expressões das layers selecionadas) e formata como string JS, uma linha por item, pronta para colar em um script;
- **arquivo → binário**: arraste arquivos (PNG, WAV, FFX…) e o BIN gera uma variável com o conteúdo de cada um, mais a função `binToFile()` para gravar de volta no disco. no ScriptUI, a string de um PNG já serve direto como imagem.

<br>

---

## 🧩 o que é recriado

| | |
|---|---|
| **tipos de layer** | shape, texto (ponto e caixa), solid, adjustment, null, câmera, luz, precomp e footage (procurados no projeto pelo nome; footage é reimportado do caminho original se existir) |
| **atributos** | nome, rótulo, comentário, entrada / saída, início, stretch, 3D, motion blur, blend mode, qualidade, guia, shy, auto-orient, time remap, travada… |
| **propriedades** | valores, keyframes (interpolação, easing, tangentes espaciais, continuidade, auto-bezier, roving), expressões (inclusive desligadas), posição com dimensões separadas |
| **grupos** | grupos de shape e todos os itens, efeitos (inclusive desligados), máscaras (modo, invertida, feather, cor), animators de texto com seletores |
| **texto** | fonte, tamanho, cor, contorno, alinhamento, tracking, entrelinha, caixa de texto e, no AE 24.3+, estilos diferentes por trecho |
| **markers** | comentário, duração, rótulo, capítulo, URL, cue point e parâmetros |
| **entre layers** | parent (sem pular a posição) e track matte |

**não recriados:** estilos de layer (a API do After Effects não permite adicioná-los), máscaras de efeito e essential properties. o painel avisa quando a layer usa algum deles.

<br>

---

## 🛠 para desenvolver

```
bin-cep/
  CSXS/manifest.xml   com.jmbillard.bin · AE 17.0+
  index.html · css/style.css
  js/cep.js           ponte com o After Effects e o disco
  js/ui.js            ícones, dicas e avisos
  js/codegen.js       captura → script (sem DOM: roda também no Node)
  js/app.js           o painel
  jsx/host.jsx        captura das layers (somente leitura) e execução
  icons/              ícones da aba
tests/
  ae_mock.js          mock do modelo de objetos do After Effects
  roundtrip.js        captura → script → recria → captura de novo (tem que bater)
  run_panel.js        painel no Chromium com o host.jsx rodando no mock
```

```bash
node tests/roundtrip.js      # ida e volta com 8 tipos de layer
node tests/run_panel.js      # painel de ponta a ponta + capturas de tela em tests/out
node tests/make_icons.js     # ícones da aba e logo
node tests/make_banner.js    # banner do instalador
node tests/installer_preview.js  # roda o instalador num ScriptUI simulado e desenha cada passo
```

para depurar o painel dentro do After Effects, com o `PlayerDebugMode` ligado, abra `http://localhost:8098` no Chrome.
