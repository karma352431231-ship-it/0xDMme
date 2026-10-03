# Fontes correspondentes — Matrix Crypto WASM 18.9.0

O arquivo `preferred-source.tar.xz` contém a tag oficial `v18.9.0` em `upstream.tar.gz`, `sources.json` e os 323 arquivos `.crate` originais fixados pelo Cargo.lock da tag, com fontes preferenciais e seus avisos/licenças. Arquivos de build/teste/plataforma também estão incluídos conservadoramente. Nenhum arquivo contém dados ou configuração privada do 0xDMme. Preservar as licenças Apache/MIT/MPL e demais avisos originais; não relicenciar os terceiros como código autoral.

Proveniência:

- [Tag upstream](https://github.com/matrix-org/matrix-sdk-crypto-wasm/tree/v18.9.0); arquivo obtido de `https://codeload.github.com/matrix-org/matrix-sdk-crypto-wasm/tar.gz/refs/tags/v18.9.0`, SHA-256 `0c39d2cf436422eb54ea70e3c8e975059e433573192a427ba5fcbaf728cec077`.
- Cargo.lock SHA-256 `f8d1c00a2210fd2869f37bcf693dd5028b7c59fda0125c52e6c6b6ad90844302`, igual à revisão do bloco 01.
- Cada `.crate` veio de `https://static.crates.io/crates/NOME/NOME-VERSAO.crate`; seu SHA-256 foi comparado com o checksum do lock. `sources.json` registra todos os resultados públicos.
- Arquivo final: 37.444.636 bytes; SHA-256 `1da81a1b9089e833800becb0fbd3ac46dd323d445cd8856c53695db13d4bfc60`.

O build verifica versão npm, SHA-256 e teto específico de 40 MiB. Divide a entrega em 18 partes de até 2 MiB, na mesma origem, acessíveis em `/matrix-crypto-18.9.0-sources.html`. Essas partes não entram no cache da PWA. Baixar todas e concatenar em ordem, por exemplo `cat matrix-crypto-18.9.0-source-1da81a1b9089e833-*.bin > preferred-source.tar.xz`; verificar o hash e copiar para esta pasta antes de `npm run build`. O pacote principal de fontes fornece o JavaScript exato incorporado e este README; o npm/lock fornece o artefato WASM exato aprovado.

Para modificar/reconstruir o motor: extrair `preferred-source.tar.xz` e depois `upstream.tar.gz` em uma pasta separada; seguir a seção de desenvolvimento/build do README upstream e seus scripts/lock de ferramentas incluídos, usando `Cargo.lock` preservado e as versões de ferramentas indicadas. Os `.crate` podem ser extraídos e usados como um registry/vendor local; verifique os checksums antes. Não executar scripts obtidos sem revisar a alteração. Esta entrega de fontes não afirma que recompilar gera um binário byte a byte idêntico ao WASM npm. Alterar o motor exige repetir revisão técnica/licenças/advisories e testes; o build normal do frontend preserva a versão npm 18.9.0.
