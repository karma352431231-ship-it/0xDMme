import { startPwa } from '../pwa/index.ts';
import { startAccount } from '../account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';

const pages = {
  conversas: {
    title: 'Conversas',
    content: `<div class="conversation-layout"><div class="list-placeholder"><h2>Suas conversas</h2><p>Nenhuma conversa ainda.<br>Seus contatos aparecerão aqui após a conexão da conta.</p></div><div class="empty-state"><span class="empty-symbol" aria-hidden="true">#</span><span class="eyebrow">CONVERSAS COM PRIVACIDADE</span><h2>Um espaço para se conectar.</h2><p>Seu próximo diálogo começa aqui. Conecte sua conta acima. O envio de mensagens será habilitado após a integração dos dispositivos e do cofre.</p><p class="detail">A prova criptográfica foi validada. O chat está em construção.</p></div></div>`,
  },
  contatos: {
    title: 'Contatos',
    content: `<div class="card empty-state"><span class="empty-symbol" aria-hidden="true">◎</span><span class="eyebrow">CONEXÕES SOB SEU CONTROLE</span><h2>Sua agenda começa com você.</h2><p>Contatos por wallet, convites e solicitações estarão disponíveis depois do login e do cofre. Apelidos particulares serão preservados de forma cifrada.</p><button class="primary" disabled>Adicionar contato · em preparação</button></div>`,
  },
  cofre: {
    title: 'Cofre',
    content: `<div class="cards"><article class="card"><span class="eyebrow">HISTÓRICO RECUPERÁVEL</span><h2>Seu cofre pessoal</h2><p>O cofre preservará mensagens e mídias aceitas, dentro da cota de <strong>300 MB</strong>. Ainda não há cofre associado a esta sessão.</p><div class="progress" aria-hidden="true"></div><p>Uso indisponível · conta não conectada</p></article><article class="card"><span class="eyebrow">RECUPERAÇÃO</span><h2>O segredo fica com você.</h2><p>A recuperação exigirá a wallet original e o segredo gerado no dispositivo. O login isolado não abrirá o histórico.</p><button class="primary" disabled>Configurar recuperação · em preparação</button></article></div>`,
  },
  configuracoes: {
    title: 'Configurações',
    content: `<div class="cards"><article class="card"><span class="eyebrow">PRIVACIDADE</span><h2>Você escolhe o que compartilhar.</h2><p>Salve suas escolhas no perfil cifrado acima. A distribuição de presença e leitura será integrada com os contatos e as mensagens.</p><div class="privacy-list"><div class="privacy-row"><span>Exibir online</span><span>Escolha no perfil</span></div><div class="privacy-row"><span>Exibir último acesso</span><span>Escolha no perfil</span></div><div class="privacy-row"><span>Enviar confirmação de leitura</span><span>Escolha no perfil</span></div></div></article><article class="card"><span class="eyebrow">APLICATIVO</span><h2>Seu espaço, também na tela inicial.</h2><p>Use a opção de instalação do navegador quando disponível. O modo offline mantém somente a interface pública desta versão.</p><p id="pwa-state" role="status">Verificando disponibilidade offline…</p><button class="primary" id="check-updates" type="button">Verificar atualização</button></article></div>`,
  },
};

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Interface incompleta.');
  return result as T;
}

let connectedAccount: AccountSession | null = null;
const account = startAccount({
  changed: (session) => {
    connectedAccount = session;
    connection();
    const label = document.getElementById('account-label');
    if (label)
      label.textContent = session
        ? session.name || 'Conta conectada'
        : 'Conta não conectada';
  },
});
// Approval HTML is loaded online and does not install or activate a shell.
const pwa = account.approvalPage
  ? null
  : startPwa({ canActivate: account.canActivate });

function route(): void {
  if (account.approvalPage) {
    renderApprovalPage();
    return;
  }
  const selected = location.hash.slice(1);
  if (selected === 'workspace') return;
  const key = Object.hasOwn(pages, selected)
    ? (selected as keyof typeof pages)
    : 'conversas';
  const page = pages[key];
  element('page-title').textContent = page.title;
  element('breadcrumb').textContent = page.title.toLocaleUpperCase('pt-BR');
  // Templates are static authored content. No user/server input enters HTML.
  element('page-content').innerHTML = page.content;
  if (key === 'configuracoes' || key === 'conversas') {
    const container = document.createElement('div');
    container.className = 'account-section';
    element('page-content').prepend(container);
    account.mount(container);
  }
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((link) => {
    if (link.dataset['route'] === key)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${page.title} · 0xDMme`;
  const button = document.getElementById('check-updates');
  button?.addEventListener('click', () => {
    void pwa?.check();
  });
  pwa?.render();
}

function renderApprovalPage(): void {
  element('page-title').textContent = 'Confirmar assinatura';
  element('breadcrumb').textContent = 'CONTA';
  const container = document.createElement('div');
  element('page-content').replaceChildren(container);
  account.mount(container);
  document.title = 'Confirmar assinatura · 0xDMme';
}

function connection(): void {
  element('connection').textContent = navigator.onLine
    ? connectedAccount
      ? 'Conta conectada · histórico bloqueado'
      : 'Conexão disponível · nenhuma conta conectada'
    : 'Sem conexão · somente a interface está disponível';
}

window.addEventListener('hashchange', route);
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
route();
connection();
