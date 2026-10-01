# Fontes preferenciais de libsodium 0.8.4

Este diretório acompanha a prova local Phantom/Solana. A biblioteca mantém sua licença ISC; avisos das ferramentas auxiliares permanecem nos próprios arquivos. Nenhuma fonte autoral do 0xDMme foi movida para este arquivo.

`preferred-source.tar.xz` contém fontes de C, headers, configuração, testes e scripts de build da biblioteca, além dos geradores, símbolos, templates, manifesto, avisos e Makefile dos wrappers. Raiz ao extrair: `libsodium.js/`, com fontes C em `libsodium.js/libsodium/`. Dist JS/WASM já gerado, demos de browser, benchmarks e testes JS foram excluídos do repositório de wrappers; fontes C e seus testes foram mantidos integralmente. Os artefatos JS usados pelo aplicativo e seus avisos seguem nos pacotes npm incluídos no arquivo principal de fontes.

- Wrappers/core JS: commit `2830fcf2ce8cefd3fdc7e1efc9fc1cee1d2d95b7`, declarado no `gitHead` do npm 0.8.4: [fonte oficial](https://github.com/jedisct1/libsodium.js/tree/2830fcf2ce8cefd3fdc7e1efc9fc1cee1d2d95b7).
- C: submódulo `33cc75ab1565d9dcbe808354191bd572ad6b64d0` desse commit: [fonte oficial](https://github.com/jedisct1/libsodium/tree/33cc75ab1565d9dcbe808354191bd572ad6b64d0).
- SHA-256 do arquivo preferencial: `2528bcbb8a0ed0d1a5492916f455e9a73adeb165f5cf54113834de193c50e29e`.
- Nome público fixado: `libsodium-0.8.4-sources-2528bcbb8a0ed0d1.tar.xz`, entregue junto do build, na mesma origem, sem autenticação. No ambiente canônico: [download das fontes preferenciais](https://0xdmme.app/libsodium-0.8.4-sources-2528bcbb8a0ed0d1.tar.xz). O endereço só existirá após publicação autorizada dessa release.

## Reconstrução do frontend

O arquivo principal “Código e licenças” inclui este README e os pacotes npm, enquanto as fontes preferenciais completas são um download separado na mesma origem. Isso mantém cada asset dentro do orçamento existente de 2 MiB. Baixe o arquivo `.tar.xz` indicado acima e copie-o para `vendor/libsodium-0.8.4/preferred-source.tar.xz` na árvore extraída do arquivo principal. O build confere versão e SHA-256 antes de copiá-lo como asset público; não baixa código durante o build. Siga então `docs/FONTES_FRONTEND.md`: Node 24.14 da série 24, npm 11, `npm ci` e `npm run build`. Não há execução de C, Bun ou Emscripten nesse caminho, nem acesso à wallet/VPS.

## Regeneração opcional da biblioteca

Para modificar/regenerar a biblioteca, extraia o `.tar.xz` numa pasta de trabalho separada. O Makefile original fornece os alvos `standard` e `pack`: `make standard` gera os módulos padrão; `make pack` também gera tipos e minifica. A execução requer GNU Make, Bun e o toolchain Emscripten ativado (`emcc`/`emconfigure`/`emmake`), além das ferramentas de geração referidas nos scripts originais. O manifesto upstream declara Terser `^5.46.1`; preserve as versões efetivamente escolhidas no seu ambiente de reprodução. Os scripts C `dist-build/emscripten.sh` e os geradores `wrapper/build-wrappers.ts` estão incluídos. Não executar o alvo de testes de browser, que referencia demos omitidas.

A revisão comparou os dois arquivos ESM publicados no npm com os arquivos `dist/modules-esm/` do commit oficial: ambos coincidem byte a byte. Os fornecedores não registram no manifesto todas as versões dos compiladores usadas na publicação. Não afirmamos regeneração C/WASM bit a bit; nenhuma recompilação C foi executada nesta revisão. Alterar/recompilar as primitivas exige nova revisão e provas de interoperabilidade, em vez de reutilizar silenciosamente o hash atual.
