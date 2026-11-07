# ficha técnica · ABERTURA v03 · CRÉDITO DE DIREÇÃO

## comp principal
- nome: ABERTURA_v03
- tamanho: 1920 × 1080 · 29.97 fps · duração 0:10
- layers: 8 · precomps: 2
- markers da comp: 0:02 "troca de cena"

## configuração do padeiro (_config.json)
- nome da configuração: ABERTURA v03 · CRÉDITO DE DIREÇÃO
- prefixo das comps: ABT
- caixa de texto: livre
- separador: "\n"
- tempo de referência: 2 s
- exemplo de preenchimento:
```
Direção
ANA BEATRIZ LIMA
```
- dicas atuais:
```
digite a função na 1ª linha e o nome na 2ª.

nomes longos: use no máximo 28 caracteres.
```
- pastas de output: 1
- fontes na pasta FONTS: Inter-Bold.ttf

## layers preenchidos pelo padeiro (ordem do input)
1. CRÉDITO direção (layer 4, conteúdo do texto) · hoje: "Direção\nANA BEATRIZ \"Bia\" D'Ávila"

## controles de expressão
- **amp** (slider) no layer "CONTROLE" da comp "ABERTURA_v03" · valor: 3
  - usado por: TITULO_principal › Transform › Rotation

## expressões
- TITULO_principal › Transform › Rotation (comp "ABERTURA_v03"):
```js
var amp = thisComp.layer("CONTROLE").effect("amp")("Slider");
wiggle(2, amp);
```
- TITULO_principal › Transform › Opacity (comp "ABERTURA_v03") · desligada:
```js
value * 0.5
```

## layers da comp principal (de cima para baixo)
1. CTRL_titulo · null
2. MATTE · solid
3. TITULO_principal · shape · parent: CTRL_titulo · track matte: alpha de MATTE
4. CRÉDITO direção · texto · parent: CTRL_titulo
5. CONTROLE · adjustment
6. PRE logo · precomp
7. Camera 1 · câmera
8. Luz · luz

## textos
- CRÉDITO direção (comp "ABERTURA_v03"): "Direção\nANA BEATRIZ \"Bia\" D'Ávila" · Inter-Bold 72 pt · caixa de texto

## precomps
- PRE logo → comp "PRE logo" (dentro de "ABERTURA_v03")
- PRE icone → comp "PRE icone" (dentro de "PRE logo")