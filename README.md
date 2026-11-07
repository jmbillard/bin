<p align="center">
  <img src="docs/img/logo.png" width="72" alt="BIN">
</p>

# BIN

🗨️ **pt-BR** ⚡ extensão do After Effects para **engenharia reversa de layer** ⚡

O **BIN** lê as layers selecionadas (ou uma **comp inteira**, com as precomps) e gera um script **.jsx** que recria tudo do zero, em qualquer projeto: propriedades, keyframes com easing e tangentes, expressões, efeitos, máscaras, shapes, textos, markers, parentesco, track matte e as configurações da comp.

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
2. [capturar](#2--capturar)
3. [escolher o que entra no script](#3--escolher-o-que-entra-no-script)
4. [comp inteira](#4--comp-inteira)
5. [o código gerado](#5--o-código-gerado)
6. [recriar, copiar e exportar](#6--recriar-copiar-e-exportar)
7. [utilitários](#7--utilitários)
8. [o que é recriado](#-o-que-é-recriado)
9. [para desenvolver](#-para-desenvolver)

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

## 2 · capturar

o BIN tem dois modos de captura:

- **layers selecionadas**: selecione uma ou mais layers na comp e clique em **capturar seleção**;
- **comp inteira**: abra a comp (ou selecione no painel Project) e clique em **comp inteira**. veja a [seção 4](#4--comp-inteira).

depois da primeira captura, o seletor no topo da aba propriedades troca de modo, e o chip da layer captura de novo.

<p align="center">
  <img src="docs/img/01-vazio.png" width="280" alt="painel vazio">
</p>

a captura é **somente leitura**: nada no projeto é alterado e o histórico de undo fica limpo.

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

## 4 · comp inteira

no modo **comp inteira**, o BIN captura a comp ativa com todas as layers e também as **precomps** usadas dentro dela, em qualquer profundidade. o script gerado cria as comps no projeto, das mais internas para a principal, e liga cada layer de precomp à comp recém-criada.

<p align="center">
  <img src="docs/img/09-comp.png" width="280" alt="comp inteira">
  <img src="docs/img/10-comp-recriada.png" width="280" alt="comp recriada">
</p>

- cada comp aparece com o card **comp · configurações** (tamanho, duração e frame rate, mais o que for diferente do padrão: cor de fundo, work area, motion blur, shutter, renderizador…) e os **markers da comp**;
- as layers começam recolhidas: clique no cabeçalho para abrir;
- **desmarque uma precomp** para não recriá-la: as layers que a usam procuram a comp original no projeto pelo nome. as precomps que só ela usava saem junto;
- a comp principal sempre entra.

<br>

---

## 5 · o código gerado

a aba **código** mostra o script com numeração de linhas. as funções auxiliares do BIN ficam recolhidas na prévia (clique para ver).

| opção | o que faz |
|---|---|
| **recriar em** | só no modo layers. `comp ativa` usa a comp aberta quando o script roda. `nova comp` cria uma comp igual à de origem (configurações e markers). no modo comp, o script sempre cria as comps. |
| **envolver em função** | uma função `criar_nome_da_layer(comp)` por layer, fácil de reaproveitar (no modo comp, mais uma `criar_comp_nome()` por comp). desligado, gera o código corrido. |
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

## 6 · recriar, copiar e exportar

- **recriar layer** roda o script na hora, dentro de um único undo. o botão fica verde e o aviso oferece **desfazer** e **exportar .jsx**;
- **copiar** e **exportar** ficam na barra da aba código. o arquivo é salvo em UTF-8 com BOM, que o ExtendScript lê com acentos corretos em qualquer sistema;
- o selo **avisos** no rodapé lista o que pode dar diferença em outro computador: fontes, plug-ins de terceiros, footage e precomps (procurados no projeto pelo nome).

<p align="center">
  <img src="docs/img/04-recriada.png" width="280" alt="layer recriada">
  <img src="docs/img/06-avisos.png" width="280" alt="avisos">
</p>

<br>

---

## 7 · utilitários

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
| **comps** | tamanho, duração, frame rate, cor de fundo, início do timecode, work area, motion blur e shutter, frame blending, shy, draft 3D, renderizador, rótulo, comentário, markers e precomps aninhadas |

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
  scene.js            comp de exemplo usada nos testes
  installer_preview.js  instalador num ScriptUI simulado
```

```bash
node tests/roundtrip.js      # ida e volta: 8 tipos de layer e uma comp com precomps aninhadas
node tests/run_panel.js      # painel de ponta a ponta + capturas de tela em tests/out
node tests/make_icons.js     # ícones da aba e logo
node tests/make_banner.js    # banner do instalador
node tests/installer_preview.js  # roda o instalador num ScriptUI simulado e desenha cada passo
```

para depurar o painel dentro do After Effects, com o `PlayerDebugMode` ligado, abra `http://localhost:8098` no Chrome.
