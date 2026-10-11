// Authored markup only: no session, profile or server value enters it.
export const accountTemplate = `<article class="card account-card"><span class="eyebrow">CONTA POR WALLET</span><h2 data-account-title>Seu perfil no 0xDMme</h2>
<p data-account-intro>Entre com sua wallet ou vincule este aparelho em Perfil → Aparelhos. Assinaturas de acesso não movimentam fundos.</p>
<button class="primary" type="button" data-wallet-approve hidden>Confirmar assinatura</button>
<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">Conectar wallet</button>
<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="Escolher wallet">
<div data-wallet-brands><h3>Escolha sua wallet</h3><p class="detail">A detecção indica disponibilidade neste navegador. No Chrome/Safari do celular, escolha o app que você instalou; ele pode não ser detectado aqui.</p>
<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">Não detectada</span></button></div>
<div data-other-wallets class="wallet-options"></div></div>
<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← Trocar wallet</button><h3 data-wallet-network-title></h3><p class="detail">Escolha o ecossistema da conta.</p>
<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="MetaMask:solana" data-network-brand="MetaMask"><span>Solana</span><span class="wallet-detection" data-detection="MetaMask:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">Não detectada</span></button></div>
<div data-other-wallet-networks class="wallet-options"></div></div>
<p class="detail">No celular, selecionar o ecossistema tenta abrir a wallet para assinar. Depois volte a este navegador para confirmar o endereço. EVM e Solana são contas separadas.</p></section>
<p data-wallet-purpose hidden>Assine apenas se você abriu este pedido no seu navegador. Ele conectará esse navegador à sua conta; recuse links recebidos de outras pessoas.</p>
<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">Abrir wallet</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>Confirmar este endereço neste navegador</button><button data-wallet-cancel type="button">Cancelar pedido</button></div>
<p class="detail" data-wallet-manual hidden>Para voltar ao navegador original, use a tela de apps recentes do celular. O pedido só terá assinatura confirmada quando esta página informar isso.</p>
<p data-account-status role="status">Verificando sessão…</p><button data-account-finish type="button" hidden>Concluir entrada na conta</button>
<details data-wallet-diagnostics hidden open><summary>Diagnóstico do login</summary><p class="detail" data-wallet-diagnostic></p><p class="detail">Se falhar, envie esta linha. Ela não contém ticket, endereço ou assinatura.</p></details>
<div data-profile hidden><div class="profile-identity"><button class="profile-avatar" data-profile-avatar type="button" aria-label="Alterar foto de perfil">#</button><div><strong data-profile-name></strong><p data-account-address class="account-address"></p><div class="settings-actions"><button data-profile-copy type="button">Copiar wallet</button><button data-logout type="button" aria-label="Encerrar sessão">Sair</button></div></div></div>
<details class="settings-section" data-settings-section="account"><summary><span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 16 12-12 4 4-12 12H4zM13 7l4 4"/></svg></span><span><strong>Editar perfil e privacidade</strong><small>Nome, presença, leitura e lembrete de backup</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary><div class="settings-body">
<form data-name-form><label>Nome mostrado nas solicitações de contato<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">Salvar nome</button></form>
<div data-private-profile hidden><h3>Presença e preferências</h3>
<form data-preferences><label><input type="checkbox" name="online"> Exibir online para contatos aprovados</label><label><input type="checkbox" name="lastSeen"> Exibir último acesso para contatos aprovados</label><label><input type="checkbox" name="readReceipts"> Enviar confirmação de leitura</label><label><input type="checkbox" name="backupReminder"> Lembrar de salvar um backup a cada sete dias</label><button class="primary" type="submit">Salvar preferências</button></form></div>
</div></details><p data-profile-status role="status"></p></div></article>`;
