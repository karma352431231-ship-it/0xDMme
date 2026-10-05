# Bloco 12A — Representantes e permissões verificáveis

Início local autorizado em 04/10/2026. Não inclui ZK, ativação na VPS ou autorização de nova migração remota. O bloco 11 já está integrado no checkout.

## Decisão do proprietário

Organizações são criadas no próprio aplicativo. A wallet da conta responsável assina a identidade da organização e suas autorizações; o representante aceita a associação antes de apresentá-la. O cartão identifica emissor, representante, escopo, prazo e estado atual. Nome semelhante não comprova que o emissor representa uma empresa externa. A autorização declara uma função, sem conceder cargos de grupo, acesso ao histórico, assinatura de acordos ou poderes financeiros.

Vínculo externo opcional por domínio: o dono informa o domínio e assina um desafio específico da organização/wallet, com código aleatório e prazo. Publica o valor indicado em TXT no DNS e o servidor verifica. Isso comprova acesso administrativo ao domínio naquele momento, inclusive por administrador autorizado, sem comprovar titularidade legal ou reputação. A interface mostra o domínio exato e **Controle do domínio verificado**. Sem domínio, o fluxo básico permanece disponível.

Após identificar risco no protótipo de retorno entre navegadores, o proprietário escolheu concluir o corte local com assinatura no navegador da wallet ou extensão e deixar esse retorno móvel pendente. A chave inserida no endereço interno codificado poderia chegar à infraestrutura dos links de abertura da wallet, permitindo consultar o pedido privado. Isso é um risco do desenho, não evidência de que o provedor tenha coletado dados. Protótipo, páginas e APIs removidos. A assinatura exige wallet disponível no contexto atual; sem ela, a interface explica a pendência. A V1 móvel ainda precisa de solução/validação própria, sem mudança no login ou recuperação atuais.

## Contratos de implementação

- Reutilizar as assinaturas fora da blockchain das wallets EVM/Solana já suportadas. Finalidade e origem próprias, separadas de login e recuperação. Não incluir contas de contrato sem verificação específica; o login atual não oferece esse suporte. Compatibilidade de novos pedidos deve ser validada nos navegadores/aparelhos alvo.
- Uma wallet emissora por organização nesta versão; nenhuma transferência automática ou delegação de emissão. Escopo explícito, validade obrigatória e renovação por nova credencial. Prazo padrão de 90 dias é editável, não um limite de produto.
- Nome da organização, escopo, identidade do representante e assinaturas completas ficam no cliente, cofre criptografado e mensagens E2EE. Registro operacional armazena somente identificadores aleatórios, emissor, hashes, prazo e revogação. Não criar diretório aberto de organizações/representantes.
- Aceite assinado pela wallet do representante, vinculado à credencial exata. Apresentação não permite que outro remetente assuma a identidade. Exportação/backups conservam a prova histórica; não restauram validade atual nem desrevogam uma autorização.
- Consulta de estado autenticada no chat, por identificador/hash conhecido, sem exigir que o aparelho acesse o domínio. Sem resposta atual, indicar inconclusivo; nunca usar assinatura antiga como autorização atual. Revogação é assinada pelo emissor e irrevogável para aquela credencial.
- Desafio DNS válido por 30 minutos, sem reuso entre contas/organizações/domínios. Conferência externa fora da transação SQL, com prazo e concorrência limitados. A publicação é deliberada; domínio e seu vínculo com o emissor passam a ser divulgados quando o cartão é compartilhado. Não publicar representantes no DNS.
- Verificação de domínio vale por até 24 horas; revalidar em manutenção limitada. Remoção/troca de registro ou falha de consulta não mantém um selo atual sem evidência. DNS não oferece proteção absoluta contra comprometimento do provedor; este vínculo depende do verificador do 0xDMme, sem afirmar prova criptográfica independente do DNS.
- Registros operacionais e privados consomem cota pessoal/global; paginação e lotes limitados. Revogação continua possível quando a cota está cheia, sem criar registro adicional.

## Fluxo entregue

1. Em Configurações → Organizações e representantes, criar e assinar a organização. Uma conta vinculada ainda precisa da wallet emissora para essas assinaturas.
2. Emitir para um contato aprovado, escolhendo escopo e data. Prazo sugerido de 90 dias pode ser editado. Emissão pendente de sincronização é preservada no cofre e pode ser concluída sem trocar o identificador.
3. Na conversa do representante, abrir Autorizações de representantes → Minhas autorizações e enviar o cartão para aceite.
4. O representante verifica e assina o aceite no cartão. Depois pode apresentá-lo em outra conversa aprovada; quem recebe consulta a validade no próprio cartão.
5. O emissor pode revogar nas configurações. Apresentação/aceite recusam autorizações expiradas/revogadas. O cartão mostra o horário da consulta pontual e orienta verificar novamente antes de usar a autorização. Falhas de consulta são inconclusivas; não promovem uma assinatura histórica a permissão atual.
6. Para domínio opcional, gerar/assinar o desafio, publicar o TXT indicado no painel DNS e verificar. Nenhum registro DNS real é publicado pelo aplicativo.

Persistência operacional na migração 025: organizações, hashes/prazos/revogações de autorizações e vínculo opcional de domínio. Nomes, escopos e representantes completos permanecem no cofre/mensagens E2EE. Consulta por identificador/hash conhecido, autenticada e assinada pelo aparelho. Alterações de domínio revalidam o estado, sem manter selo atual quando a consulta falha; manutenção processa até dois domínios por rodada. Registros aceitos não expiram automaticamente do armazenamento.

## Validação e entrega

Corte local concluído em 05/10/2026. Validação realizada:

- Lint, tipos, fronteiras de dependências, licenças, formatação e build passaram. O build conserva 38 assets e os limites existentes de fontes/assets; nenhuma dependência foi acrescentada.
- Os 249 testes unitários passaram entre a execução principal e a repetição dos quatro testes HTTP que o sandbox havia bloqueado com `EPERM` de loopback. Os cinco testes de representantes passaram novamente após os ajustes de troca de sessão. Os 81 testes Python do comando de deploy também passaram; esse comando de testes não publica nem ativa código.
- Integração de representantes passou no banco local exclusivo: autorização do aparelho/emissor, isolamento, privacidade do registro operacional, idempotência/concorrência, revogação mesmo com capacidade cheia e vínculo DNS sintético. Integrações de mensagens e cofre passaram. A soma independente do teste do cofre foi atualizada para incluir grupos, status e representantes; a contabilidade real foi conferida sem alterar o contador ou remover dados anteriores.
- Smoke no navegador com wallet EVM fictícia: criação/assinatura da organização, desafio opcional DNS e resposta sem verificação quando o TXT está ausente. Logout remove nome, domínio e painel privado; operações pendentes recusam sessão alterada. Evidências operacionais ficam somente em `.local/`, fora do Git.

Os testes não substituem a aceitação com wallets/aparelhos físicos ou a publicação e propagação de um TXT real. Emissão, aceite, apresentação e revogação foram cobertos por testes criptográficos/integração; o fluxo completo entre duas pessoas ainda requer aceitação manual. Na conclusão do corte local, nenhuma associação real foi publicada, nenhuma migração foi ativada na VPS e não houve commit/push nessa etapa. A migração 025 permanece sujeita a revisão específica antes da ativação remota. O retorno das novas assinaturas ao Chrome/Safari do celular continua pendente conforme a decisão do proprietário.

**Ponto importante:** assinatura demonstra autorização pela wallet emissora. Domínio é uma evidência opcional de controle, e a consulta de revogação é necessária para afirmar validade atual. Nenhum selo garante identidade civil, honestidade, titularidade legal ou disponibilidade eterna de uma organização.

## Envio à VPS solicitado em 05/10/2026

Preparar commit exclusivo do corte, CI do commit exato e envio ao Git dedicado da VPS, preservando as alterações anteriores do proprietário em `AGENTS.md` e no roteiro de simplificação. O envio de fontes não ativa a release. A ativação depende da revisão específica da migração 025 no executor existente e da aprovação do proprietário, conforme [contrato de deploy](GIT_E_DEPLOY.md).

A proposta de transição acrescenta somente as três tabelas de organizações, recibos de autorizações e vínculo opcional de domínio, índices/constraints e cobrança. Não altera as migrações 001–024 nem as tabelas anteriores. Reutilizar backup privado, ensaio de restauração, digests integrais das tabelas existentes, conferência das novas tabelas vazias e da contabilidade antes de reabrir. Preservar runtime/dependências e serviços compartilhados; parar/iniciar somente o serviço próprio. Falha depois da abertura conserva novas gravações, sem restaurar automaticamente dados antigos.

Fontes de aplicação revisadas em `c70eeed`, enviadas ao GitHub. Auditoria somente leitura confirmou o predecessor ativo `2772aba`, 24 migrações, 45 tabelas existentes, saúde e preservação. O executor se vincula a esses commits e conserva o bloqueio de outras mudanças de banco, conforme [revisão do envio](GIT_E_DEPLOY.md#preparação-do-bloco-12a--05102026).

Após o envio de `0891b4b` à VPS, sua CI integral e o pré-flight aprovados, o proprietário autorizou aplicar a migração 025 e ativar o corte no ambiente de testes em 05/10/2026. Usar o executor existente com backup, teste de restauração e reinício somente do serviço próprio; conservar os limites e pendências acima. Registrar o resultado após verificar a publicação.
