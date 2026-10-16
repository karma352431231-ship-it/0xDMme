# Foto privada e URLs — 15/10/2026

O proprietário pediu salvamento automático da foto da conta privada e endereços
em inglês para o app, incluindo a tela dividida, categorias de configurações,
perfis públicos de usuários e comunidades.

## Foto da conta privada

Escolher uma foto válida ou removê-la grava imediatamente o perfil cifrado pela
mesma operação, chave e revisão existentes. A confirmação adicional foi retirada
somente da foto. Nome e preferências de privacidade continuam com seus próprios
rascunhos e confirmação explícita; escolher uma foto não confirma essas escolhas.

A imagem anterior continua sendo a foto compartilhada até a gravação terminar.
Falhas conservam a imagem salva, descartam os bytes do candidato e informam que
é preciso selecionar novamente. O campo permite repetir o mesmo arquivo. Troca
de sessão, chave ou perfil invalida resultados antigos. Uma escolha concluída ou
recusada não deixa um rascunho de foto bloqueando a atualização da PWA; operações
em andamento e outros rascunhos continuam protegidos pelas guardas existentes.
Formatos, tamanho, distribuição E2EE e persistência cifrada permanecem iguais.

As responsabilidades ficam em `account/private-photo-save.ts` (ciclo da foto)
e `account/private-profile-write.ts` (gravação cifrada compartilhada). A classe do
perfil conecta a interface e conserva seus rascunhos de nome e preferências.

## Endereços

A atualização de 16/10/2026 usa caminhos reais, sem `#`, para a navegação pública:

| Destino                     | Exemplo                                                  |
| --------------------------- | -------------------------------------------------------- |
| Conversas                   | `/chats`                                                 |
| Só conversa no desktop      | `/chats?layout=chat`                                     |
| Feed com conversa ao lado   | `/split/feed`                                            |
| Feed com conversa recolhida | `/split/feed?layout=feed`                                |
| Categoria de configurações  | `/settings/privacy`                                      |
| Perfil público do usuário   | `/users/handle/karma` ou `/users/id/<UUID público>`      |
| Perfil no painel dividido   | `/split/profile/karma`                                   |
| Comunidade nova             | `/communities/nome-da-comunidade`                        |
| Comunidade existente        | `/communities/id/<UUID público>`                         |
| Post                        | `/communities/id/<UUID público>/posts/<UUID público>`    |
| Comunidade no painel        | `/split/communities/nome-da-comunidade`                  |
| Outras páginas              | `/contacts`, `/activity`, `/vault`, `/review`, `/status` |

Os fragmentos ingleses/portugueses anteriores continuam aceitos e são
normalizados sem acrescentar uma entrada ao histórico. Os filtros adicionais
mantêm seu contrato de query. Nome e conteúdo privado não entram nesses caminhos.
Convites de contato/grupo, vínculo de aparelho e retornos da wallet mantêm seus
fragmentos e leitores originais; suas capacidades não migram para caminhos HTTP.
O servidor entrega somente o shell público nas rotas reconhecidas, com a mesma
CSP e `no-store`. A PWA busca o documento publicado online e, sem rede, reutiliza
apenas o shell completo guardado em `/`; não guarda documentos por perfil,
comunidade, post ou filtros, nem respostas de API.

### Endereços das comunidades — decisão de 16/10/2026

O proprietário escolheu endereços únicos e depois limitou a aplicação às novas
comunidades. A migração 072 cria `community_addresses`, com uma linha por nova
comunidade, slug único, FK com exclusão em cascata, cobrança global e autovacuum.
Não há backfill nem alteração de comunidades existentes. A criação assinada
atribui o endereço na mesma transação e retries conservam a mesma linha. O nome
é normalizado para minúsculas, sem acentos e com hífens, preservando letras de
outros alfabetos; nomes sem letras/números usam `community`. Destinos reservados
recebem `-community`. Colisões recebem `-2`, `-3` etc., com até 100 candidatos e
trava transacional curta; o índice único é a guarda final. A edição do nome,
transferência e arquivamento não trocam o endereço. UUIDs públicos continuam
válidos, inclusive nos permalinks de posts.

O proprietário também pediu Discover inicialmente em 24 horas. Uma seleção
explícita de período continua disponível e o retorno de um post restaura o
período escolhido. Seguindo, salvos e ocultos conservam seus padrões anteriores.
Miniperfis de pessoas e comunidades conservam o quadro 3:1 usado pelo editor;
a imagem preenche o quadro com recorte central. A logo da navegação usa um SVG
sem a borda externa e aponta para `/split/feed`; os ícones da PWA são preservados.

Posts, abas e DMs pelo @ conservam os parâmetros públicos já existentes. A URL
dividida restaura o arranjo e o contexto público, inclusive a DM pelo @; não
inclui a seleção de contato/conversa privada, wallet, texto ou chaves. Em telas
estreitas o link dividido abre o destino público na página apropriada. Abrir
uma conversa privada no celular continua em `/chats`, inclusive após recarregar.

Links portugueses anteriores continuam aceitos. A navegação os normaliza para
os caminhos atuais sem acrescentar uma entrada ao histórico. Convites de contatos novos
usam `#contacts?invite=...`; links antigos continuam válidos e a capacidade fica
no fragmento, sendo retirada pelo mesmo leitor antes das consultas. Fragmentos
do retorno/consentimento da wallet e convites de grupo mantêm seu protocolo.
Notificações aceitam workers anteriores, restringindo o destino a IDs públicos.

Voltar/avançar e mudanças somente de arranjo mantêm a conversa privada montada.
Trocar a categoria de configurações também conserva seus widgets e rascunhos.
Eventos atrasados de categorias removidas ou de outra página não alteram a URL.
As regras de endereço ficam em `shared/app-routes` e `app/panel-route.ts`.

## Validação e limites

Testes cobrem gravação cifrada automática, revisão, remoção, falha, troca de
sessão, preferências ainda não confirmadas, aliases, notificações restritas,
restauração dos destinos públicos e arranjos mobile/tablet/desktop. O cenário
de categorias atrasadas reproduz a navegação indevida encontrada no navegador.

Uma página local com os módulos reais e dados sintéticos conferiu salvamento,
recarga e falha da foto, categorias com URL própria, perfil público no painel,
voltar/avançar e preservação do texto da conversa durante navegação dos painéis.
Em 390 px, o link de perfil dividido abriu a página de usuário. Os adaptadores
de transporte e conteúdo público foram simulados: isso não substitui o aceite
com conta real em celular físico.

**Ponto importante:** a entrega original de 15/10/2026 não alterou backend, migrações, dependências,
política de privacidade ou retenção. Após a entrega de `0455607` e sua CI integral
aprovada, o proprietário autorizou integração à main e ativação na VPS em
15/10/2026. Exigir CI do commit integrado, executor existente, preservação e
versão servida conferida, conforme [Git e deploy](GIT_E_DEPLOY.md#foto-privada-e-urls--ativação-autorizada-em-15102026).

`app/index.ts` e a closure de `startPanels` continuam hotspots. Proposta para
uma tarefa própria: primeiro separar coordenação de rotas/montagem da sessão
e conexões; depois separar o ciclo de vida de feed/perfil/DM da apresentação
do arranjo. Preservar contratos de entrada/saída, cancelamento e montagem única
com testes de inicialização, navegação e histórico e conferência no navegador.
Este lote extrai somente as novas regras de URL e gravação da foto.

A autorização posterior de 16/10/2026 inclui integração à main e ativação e,
após explicação da necessidade, o proprietário aprovou expressamente a migração
nova. Usar o executor existente, CI exata, backup/restauração e comparação de
todas as linhas anteriores e do ledger. Esse aceite não altera dependências,
Node, detector, retenção, isolamento, tráfego ou infraestrutura compartilhada.

Resolver uma comunidade por UUID para seu endereço estável atualiza também o
endereço lembrado pelos painéis e pelo roteador, sem remontar a comunidade.
Abrir uma conversa privada ou alternar colunas conserva o nome na URL e os
rascunhos montados. A regressão reproduziu o retorno indevido ao UUID antes da
correção e verifica o endereço final e a montagem única.
