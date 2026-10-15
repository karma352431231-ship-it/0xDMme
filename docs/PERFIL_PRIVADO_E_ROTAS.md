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

A navegação conserva o fragmento `#`, sem exigir mudanças no servidor:

| Destino                     | Exemplo de fragmento                                       |
| --------------------------- | ---------------------------------------------------------- |
| Conversas                   | `#chats`                                                   |
| Só conversa no desktop      | `#chats?layout=chat`                                       |
| Feed com conversa ao lado   | `#split?layout=split&view=feed`                            |
| Feed com conversa recolhida | `#split?layout=feed&view=feed`                             |
| Configurações da conta      | `#settings?section=account`                                |
| Privacidade                 | `#settings?section=privacy`                                |
| Perfil público do usuário   | `#users?handle=nome_publico` ou `#users?id=<UUID público>` |
| Comunidade                  | `#communities?id=<UUID público>`                           |
| Perfil no painel dividido   | `#split?layout=split&profile=<UUID público ou @>`          |
| Outras páginas              | `#contacts`, `#activity`, `#vault`, `#review`, `#status`   |

Posts, abas e DMs pelo @ conservam os parâmetros públicos já existentes. A URL
dividida restaura o arranjo e o contexto público, inclusive a DM pelo @; não
inclui a seleção de contato/conversa privada, wallet, texto ou chaves. Em telas
estreitas o link dividido abre o destino público na página apropriada. Abrir
uma conversa privada no celular continua em `#chats`, inclusive após recarregar.

Links portugueses anteriores continuam aceitos. A navegação os normaliza para
inglês sem acrescentar uma entrada ao histórico. Convites de contatos novos
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

**Ponto importante:** este lote não altera backend, migrações, dependências,
política de privacidade ou retenção. A ativação na VPS é uma etapa separada.

`app/index.ts` e a closure de `startPanels` continuam hotspots. Proposta para
uma tarefa própria: primeiro separar coordenação de rotas/montagem da sessão
e conexões; depois separar o ciclo de vida de feed/perfil/DM da apresentação
do arranjo. Preservar contratos de entrada/saída, cancelamento e montagem única
com testes de inicialização, navegação e histórico e conferência no navegador.
Este lote extrai somente as novas regras de URL e gravação da foto.
