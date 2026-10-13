# Emojis do 0xDMme

## Idiomas oficiais — 13/10/2026

O painel deriva nomes e palavras-chave em inglês e chinês simplificado,
sem alterar o pacote gráfico abaixo. Os quatro arquivos adicionais são originais
CLDR **48.2.3**, sob a mesma [Unicode-3.0](https://github.com/unicode-org/cldr-json/blob/48.2.3/LICENSE).
O aviso upstream foi conferido byte a byte contra `LICENSE-CLDR.txt`.
O build não baixa dados: valida os hashes e deriva as duas listas completas
de 3.963 sequências, conservando categorias, tons e chaves gráficas.

- [`annotations-en.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-full/annotations/en/annotations.json): 438.314 bytes; SHA-256 `f22083cb86dffb63a643d5bacb5d9899f82d2fa5d388ad4f3aed72184acef505`.
- [`annotationsDerived-en.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-derived-full/annotationsDerived/en/annotations.json): 782.906 bytes; SHA-256 `15c9457afa703a32dcc78d54626418a91e820fe0ddd67b7d491c4c4d9f5846ab`.
- [`annotations-zh.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-full/annotations/zh/annotations.json): 420.265 bytes; SHA-256 `8d2dfe9bf41894bd17c9c1a1906a31bf0ccc06204bf4b77c2ab2b0d8f79a5fdf`.
- [`annotationsDerived-zh.json`](https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-annotations-derived-full/annotationsDerived/zh/annotations.json): 682.370 bytes; SHA-256 `1ff96249af6fc69067f2dfabc26b450786a93d8048f2764ecfad53fd64953f92`.

Esses originais e `src/tools/frontend-emoji-locales.ts` integram o download
principal de fontes. `src/tools/frontend-emoji.ts` conserva o catálogo Unicode
do pacote original como inventário; nomes novos sem anotação têm complemento
local explícito, e uma ausência chinesa não cai silenciosamente para inglês.
O módulo público `emoji-catalog-<hash>.js` contém ambos os idiomas e entra no
shell offline. Só a escolha local decide qual lista apresentar; buscas,
seleções e recentes não saem do aparelho. As licenças/atribuições dos gráficos
continuam iguais, e nenhum parser ou pacote npm novo foi acrescentado.

## Pacote gráfico original

`assets.json.gz` é um JSON UTF-8 comprimido com gzip (mtime zero), SHA-256 `d7a2c1166a29ac85606f146f0ebf025606cc1ba0e597c6ef38cf0c691968b80a`, 1.957.171 bytes. Contém 4.009 SVGs originais do [Twemoji 17.0.3](https://github.com/jdecked/twemoji/releases/tag/v17.0.3), o README upstream, o arquivo original [emoji-test.txt 18.0](https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt), anotações pt e annotationsDerived/pt do [CLDR 48.2.3](https://github.com/unicode-org/cldr-json/tree/48.2.3), URLs de proveniência e licenças completas. Dados de terceiros são distribuídos sob suas próprias licenças; código autoral do seletor/renderer permanece GPL-3.0-only.

Twemoji: gráficos de Twitter, Inc. e demais contribuidores, **CC-BY-4.0**; preservamos o README/avisos do projeto. SVGs não foram redesenhados, somente reunidos num mapa JSON `svg` cujo nome de chave é o nome original sem `.svg`. Para recuperar os originais, descomprima com gzip, leia esse mapa e escreva cada valor em `<chave>.svg`. Catálogo/anotações: **Unicode-3.0**, com avisos completos nos campos `licenses` e nos arquivos deste diretório. O código MIT do parser Twemoji não é usado/incorporado. Há 19 sequências Emoji 18 sem arte no Twemoji 17; continuam sendo Unicode e usam a representação nativa.

O asset público é `/emoji-d7a2c1166a29ac85.json.gz`, entregue na mesma origem. O link “Desenhos e licenças dos emojis” permite baixar o pacote integral, sem autenticação. Nenhum emoji escolhido, termo de busca ou recente é enviado nessa requisição: o pacote é estático, igual para todas as pessoas e também incluído no cache público do shell.

Para reconstruir o frontend a partir de “Código e licenças”, baixe esse asset, verifique SHA-256 e copie-o para `vendor/emoji/assets.json.gz`. Rode o build documentado em `docs/FONTES_FRONTEND.md`; ele valida hash, tamanho e repertório antes de derivar o catálogo. Nenhum download ocorre no build. Para atualizar dados/desenhos, revise versões/licenças, regenere o mapa a partir dos originais, comprima JSON sem espaços em UTF-8, gzip nível 9/mtime zero, registre novo hash e valide cobertura e tamanhos. Os originais e a lógica de derivação são entregues; não há promessa de que uma ferramenta gzip diferente produza bytes idênticos.
