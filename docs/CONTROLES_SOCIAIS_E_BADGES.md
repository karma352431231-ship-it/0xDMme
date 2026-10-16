# Controles sociais e badges — pedido de 11/10/2026

Implementação solicitada pelo proprietário, dividida por contrato. Em 11/10/2026, o proprietário pediu alinhar com o `main`, enviar à VPS e ativar. A integração preserva conta modular, configuração inicial e tags múltiplas do `main`; as migrações inéditas foram renumeradas para 056–058 após conferir que a VPS já tinha 55 e ainda não tinha as tabelas sociais.

- O dono segue desde a criação, conta como primeiro seguidor e não recebe botão de seguir/deixar de seguir. O destinatário de transferência também passa a seguir; o antigo dono conserva seu follow.
- Posts e respostas mostram badges pelo papel atual: coroa para dono, escudo para moderador. “Novo membro” dura **dois dias** após seguir; datas antigas desconhecidas continuam desconhecidas.
- Badges personalizados têm atribuição manual por dono/mod, conforme escolha expressa nesta conversa. Não concedem poderes. Automação e thresholds ficam para decisão posterior.
- Alterações de apresentação em comunidade, perfil público e privado são rascunhos locais até “Confirmar alterações”. Selecionar/remover imagem e sair do campo não publica. A análise das imagens continua obrigatória após confirmar.
- Menu único de três pontos reúne ações pessoais, do autor e de gestão. Autor pode excluir e editar até uma hora após a publicação original, inclusive replies. Mostrar “Post Editado”; substituir o texto ativo sem histórico público.
- Bloquear oculta posts/replies do alvo para quem bloqueou e impede novas DMs públicas. Desbloquear não restaura consentimento. Conteúdo público continua acessível fora da sessão.
- Denúncias de posts/perfis são apenas guardadas no backend do próprio app, com acesso restrito, conforme esclarecimento do proprietário. Sem encaminhamento externo, ação ou punição automática; não copiam conteúdo privado.
- Seguir não ativa avisos. Sininho individual desligado por padrão habilita novos posts/replies na Atividade; sem avisos retroativos ou autoatividade. Avisos de respostas diretas próprias permanecem.
- Textos longos são recolhidos na timeline; “Ver tudo” expande no próprio card com links e quebras preservados.

**Ponto importante:** confirmar não dispensa moderação; badges não concedem autoridade; bloqueio não apaga cópias recebidas. Automação de badges e aceite físico ficam separados da implementação local.

A comunidade confirma nome/regras/foto/banner em uma transação. Perfis público e privado confirmam as operações já existentes em sequência; uma falha conserva o rascunho que ainda não foi salvo e apresenta erro, sem afirmar que tudo foi confirmado. Seleção e edição de campos não mudam a apresentação compartilhada nem as preferências privadas ativas.

Badges manuais têm orçamento inicial de até 20 definições por comunidade e três atribuições por pessoa. Avisos do sininho são consultados na Atividade, com paginação, sem fanout durável por postagem nem push adicional; leitura individual é registrada por referência, com cobrança na capacidade global. Desligar/deixar de seguir desativa esses avisos; reativação começa na nova escolha e não recria atividade anterior. Notificações diretas existentes preservam seu contrato.

Excluir uma definição de badge exige não haver atribuições, evitando remoção em massa numa transação. Retirar badges de membros é uma operação individual. A Atividade distingue “publicou” de “respondeu”; o filtro histórico interno `replies` conserva sua identidade e ganha o rótulo público “Publicações”.

Revisão de responsabilidades: os módulos novos isolam badges, apresentação, denúncias, sininho e rascunhos. A integração preserva a separação de conta já presente no `main` e porta os rascunhos para `account/private-profile.ts`. Os controladores antigos de comunidades e posts ainda concentram telas e estado. Uma tarefa própria pode extrair a navegação/gerência de `communities/index.ts` e depois a composição da árvore de `communities/posts.ts`. Preservar os contratos públicos e testar troca de sessão, rascunhos e navegação a cada etapa; o principal risco é alterar o ciclo de vida dos controles e das mídias. Essa reorganização não faz parte desta entrega.

## Alertas do sistema para perfis com sininho — 16/10/2026

A pedido do proprietário, posts novos e respostas de perfis seguidos com o sininho ativo aparecem no canto da tela como no X: `@usuário` no título, o texto do post embaixo e a foto pública aprovada do autor como imagem, um alerta por post. O nome da comunidade fica de fora para o alerta não crescer. Chat, respostas ao seu conteúdo de outras pessoas e o restante continuam como estavam. O payload do push segue genérico; o Worker lê a prévia no próprio servidor, e a foto vem do caminho público de avatar já validado (outros domínios são recusados). A linha com o site, o ícone do navegador e, no iPhone, o ícone do app são impostos pelo sistema e não mudam.
