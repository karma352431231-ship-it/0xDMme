# Fontes da interface do 0xDMme

Fontes variáveis distribuídas pela mesma origem do app. O navegador não consulta serviços de terceiros para carregá-las.

| Arquivo                     | Origem                                                                                     | SHA-256                                                            | Bytes  |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ |
| `figtree-latin-5.3.0.woff2` | `files/figtree-latin-wght-normal.woff2` do pacote npm `@fontsource-variable/figtree@5.3.0` | `4ba7d3d096695818fe0686be4f1e82c6b05134e18a22260336130335027462dd` | 20.156 |
| `sora-latin-5.3.0.woff2`    | `files/sora-latin-wght-normal.woff2` do pacote npm `@fontsource-variable/sora@5.3.0`       | `fa26406eeda9a3c6ec3d9ea8813c3045d6dc755e30c716d5c094e8ef43be5a7f` | 33.652 |

Figtree (texto) é da Figtree Project Authors. Sora (títulos) é da Sora Project Authors. As duas usam a **SIL Open Font License 1.1**, reproduzida em `LICENSE-FIGTREE.txt` e `LICENSE-SORA.txt`. Os arquivos não foram modificados nem renomeados internamente. Só o subconjunto latino, com o português, é entregue. Outros alfabetos usam a fonte do sistema.

O build (`src/tools/build-web.ts`) confere esses hashes e publica os dois arquivos como `/figtree-latin-5.3.0.woff2` e `/sora-latin-5.3.0.woff2`. Para atualizar, revise a versão e a licença, troque os arquivos e os hashes registrados aqui e no build, e confira o visual.
