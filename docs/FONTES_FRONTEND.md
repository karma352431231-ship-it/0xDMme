# 0xDMme — fontes correspondentes do frontend

O link “Código e licenças” na interface entrega as fontes correspondentes ao build servido, sem cadastro ou autenticação. O nome do arquivo contém seu SHA-256 abreviado; cada build publica o pacote junto dos assets. O pacote não inclui backend, configurações privadas, `.local/`, dados de contas, chaves ou inventários.

Inclui fontes autorais da interface, PWA, conta/perfil, descoberta das wallets, código compartilhado pertinente, assets originais, scripts de build, manifesto/lock npm, configuração TypeScript, texto GPL e avisos. Os pacotes de terceiros efetivamente incorporados no JavaScript são incluídos integralmente em `node_modules/`, com seus avisos/licenças; suas licenças originais continuam valendo. O frontend ainda não incorpora Matrix ou Semaphore.

Para reconstruir em uma pasta nova: extrair o `.tar.gz`, usar Node 24.14 ou superior da série 24 e npm 11 e executar `npm ci` e `npm run build`. Isso instala as versões do lockfile, inclusive o compilador esbuild. Não é necessário acesso ao banco/backend nem credencial. O build resulta em `dist/web/`; somente esses assets são públicos. Os scripts do projeto para testes/lint/backend referenciam arquivos privados ausentes desse pacote e não são necessários à reconstrução do frontend.

A licença GPL-3.0-only cobre as fontes autorais indicadas em `LICENSES.md` e os dois scripts de build entregues. Licenças de terceiros estão nos diretórios dos pacotes. O pacote disponibilizado na própria origem não depende de tornar o repositório inteiro público. Atualizações da interface precisam atualizar as fontes correspondentes; não substituir esse pacote por um link para uma versão diferente.
