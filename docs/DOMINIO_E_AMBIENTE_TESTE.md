# 0xDMme — domínio e ambiente de testes

## Decisão e estado

Em 01/10/2026, o proprietário definiu **0xDMme** como nome público e informou a compra de **0xdmme.app** via **Namecheap**. A configuração está autorizada para testes mobile em infraestrutura própria, com HTTPS público válido. Túnel externo não foi escolhido. Isso substitui a proposta de comprar domínio posteriormente ou usar certificado para o IP público.

Origem canônica: `https://0xdmme.app`. `www.0xdmme.app` deve redirecionar para essa origem. Nome de PWA, interface e novos pedidos SIWE/SIWS usam 0xDMme. Os identificadores históricos de persistência/protocolos, a pasta do workspace e a identidade Git não são migrados por essa alteração de marca.

DNS, certificado, serviço e aceite funcional são etapas distintas. Registrar execução e resultados ao concluir; não afirmar disponibilidade ou suporte de wallet com base apenas no apontamento DNS. O chat/cofre de produto ainda não está liberado para dados reais.

Em 01/10/2026, após explicação de que Nginx, disco e rede são compartilhados, o proprietário aceitou o isolamento na mesma VPS e a recarga validada do Nginx, preservando seu outro projeto. Isso autoriza somente adições próprias e recarga graciosa, sem reinício de serviços compartilhados, atualização de pacotes, alteração de firewall, bancos, certificados ou arquivos do outro projeto. Limitar recursos, registrar o estado anterior privadamente e preparar retirada apenas das nossas adições. Nenhum isolamento dentro da mesma VPS garante impacto zero do hardware/rede compartilhados.

## Execução em 01/10/2026

DNS confirmado, HTTPS público validado nos dois nomes, redirecionamento canônico e prontidão do backend conferidos. Certificado, configuração/work/logs Certbot e timer próprios; ensaio de renovação passou sem executar hook de recarga. Frontend entrega fontes/licenças da versão servida, com reconstrução local comprovada. Serviço, usuário, filesystem limitado, cluster/role e namespace de rede separados estão ativos; só o socket do backend é alcançado pelo Nginx. As definições ficam em `infra/staging/`; não são um instalador genérico nem autorização para reaplicar bootstrap em diretórios existentes.

Hashes dos arquivos de configuração anteriores, identidade/início dos processos persistentes e respostas das rotas anteriores foram comparados antes/depois e permaneceram iguais. O gerenciador temporário das sessões SSH muda com as conexões e não é usado como indicador de reinício da aplicação. Inventário, detalhes, medidas, diagnósticos e capturas permanecem exclusivamente em `.local/`. Nenhum pacote global, firewall, dependência, banco, certificado, arquivo ou serviço da outra aplicação foi alterado/reiniciado. Isso registra a evidência observada, sem garantir ausência de impacto sob tráfego futuro.

A checagem do runtime permite somente o diretório próprio e a entrada privada de propagação do systemd, pertencente a root e inacessível ao usuário do serviço. Não houve liberação de permissões de sockets do host para passar essa checagem.

A revisão dos limites efetivos confirmou os controles de CPU, memória, swap, processos, tamanho do armazenamento e I/O. A primeira checagem de I/O confundiu unidades decimais de banda do systemd com unidades binárias; a comparação foi corrigida para conferir leitura e escrita nos dois dispositivos usados pelo ambiente, incluindo a resolução da partição ao dispositivo que a contém. Os limites já estavam aplicados no kernel: não foi necessário alterar configurações nem reiniciar serviços. Resultados e medidas permanecem em `.local/`. Referência de unidades e dispositivos: [documentação do systemd](https://github.com/systemd/systemd/blob/v255/man/systemd.resource-control.xml).

## DNS na Namecheap

O proprietário aplicará os registros manualmente em **Domain List → Manage → Advanced DNS → Host Records**. A consulta inicial encontrou nameservers da Namecheap e endereço padrão do registrador.

| Tipo  | Host  | Valor                                                                | TTL       |
| ----- | ----- | -------------------------------------------------------------------- | --------- |
| A     | `@`   | IPv4 público da VPS aprovada, conforme registro privado em `.local/` | Automatic |
| CNAME | `www` | `0xdmme.app`                                                         | Automatic |

Substituir somente registros de estacionamento/redirecionamento conflitantes de `@` e `www`; preservar demais registros. Não trocar nameservers nem apontar para o endereço privado do Mac. Se existir AAAA, verificar se corresponde à VPS e se o serviço está acessível por IPv6 antes de manter o registro.

Referência: [registros A na Namecheap](https://www.namecheap.com/support/knowledgebase/article.aspx/208/32/i-dont-want-to-change-nameservers-are-there-any-other-ways-to-point-my-domain-to-your-servers/).

## Isolamento e HTTPS

- Inspecionar serviços, portas, proxy, versões e capacidade antes de configurar. Acesso e inventário ficam somente em `.local/`. Não reutilizar banco, role, diretório, chave de autenticação ou serviço de outro projeto.
- Backend e PostgreSQL de testes compartilham namespace de rede privado, sem acesso aos serviços de loopback do host. O PostgreSQL usa sua porta exclusiva nesse namespace; o Nginx alcança o backend somente pelo socket Unix próprio. Origem canônica HTTPS explícita, recusa de Host/Origin estranhos, cookies Secure/HttpOnly e proteção de mutações continuam obrigatórios. Não expor o perfil de desenvolvimento nem os laboratórios na Internet.
- Armazenamento de testes em filesystem próprio com tamanho fixo, sem permitir crescimento ilimitado no disco compartilhado. Serviços próprios têm limites agregados de CPU/RAM/processos/I/O e visibilidade de arquivos restrita; não montar diretórios do outro projeto dentro deles. Não registrar pedidos, assinaturas, tickets, perfis ou corpos HTTP. Esse ambiente pequeno de testes não é dimensionamento de produção nem reduz cotas ou escopo da V1.
- A inicialização do backend espera o banco exclusivo aceitar conexões, com deadline explícito. Processo PostgreSQL criado não significa banco pronto; manter a dependência de prontidão após reinício do ambiente próprio. Sockets do host e diretórios temporários também ficam isolados/limitados, com acesso apenas ao socket próprio de cada serviço.
- Usar serviço, usuário, banco, objetos, limites e configuração próprios; autovacuum e durabilidade continuam ativos. Não substituir arquivos do outro projeto ou configurações globais do PostgreSQL. Validar Nginx antes de recarregar e conferir novamente a saúde dos serviços anteriores.
- Emitir certificado público para os dois nomes com o Certbot disponível; a validação ACME deve coexistir com os sites existentes. Não interromper o proxy para usar `standalone`, não instalar CA de teste no cliente, não ignorar erros TLS e não contratar SSL pago.
- Configurar/verificar renovação e recarga do certificado. Conferir cadeia, hostname, resposta pública, redirecionamento `www` e vínculo de domínio nos desafios de login.
- Entregar fontes correspondentes e avisos do frontend distribuído, conforme [LICENSES.md](../LICENSES.md), antes de servir o bundle publicamente. Não incluir `.local/`, backend privado, chaves ou inventários no pacote de fontes.
- Publicação de testes não substitui o aceite da V1. Validar abertura da wallet, assinatura, retorno à aba original e confirmação de endereço no Android/iPhone; não repetir provas criptográficas do bloco 01 sem mudança relevante ou falha.

O erro relatado na Phantom Android foi `NET::ERR_CERT_AUTHORITY_INVALID`: a página não carregou com a CA privada do ensaio local, antes de executar o login. Aceitar a CA no Chrome não garante aceitação dentro de outro app; [Android documenta confiança de CAs por aplicativo](https://developer.android.com/privacy-and-security/security-config). HTTPS público válido é o caminho aprovado para esse teste; funcionamento após a troca ainda precisa ser observado.

**Ponto importante:** domínio configurado não significa chat pronto, cofre sincronizado ou integração mobile aprovada. Nenhum dado real de conversas deve ser usado nesta etapa.

## Recuperação restrita ao ambiente próprio

O proprietário aprovou usar Git para enviar código em 01/10/2026. A [sincronização por commit](GIT_E_DEPLOY.md) usa repositório próprio dentro do filesystem limitado, sem credenciais do GitHub na VPS e sem ativação automática da release. Infraestrutura e bancos existentes não são alvos dessa sincronização.

Se houver falha, parar somente `0xdmme-test.service`; se necessário, também seu cluster `0xdmme-postgres-test.service` e timer `0xdmme-certificate-renew.timer`. A retirada de rota deve remover exclusivamente o vínculo `0xdmme-test.conf` criado para esse ambiente e validar a configuração antes de uma recarga graciosa. Não restaurar snapshots globais, reiniciar Nginx/PostgreSQL compartilhados ou apagar dados/bancos para reexecutar o instalador. Preservar o filesystem e os dados próprios para diagnóstico; exclusão exige decisão específica. Se um arquivo anterior mudar durante o procedimento, pausar antes de recarregar, pois a recarga poderia aplicar mudanças de outra origem.
