import type { AccountSession } from '../../shared/account/index.ts';
import { base64 } from '../../shared/account/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { openStoredAttachment } from '../attachments/index.ts';
import { profileCard } from '../message-profile/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import { Backups } from './controller.ts';
import type { BackupRecord } from '../backup-records/index.ts';
export function startBackups(access: VaultAccess, sync: VaultSync) {
  const controller = new Backups(access, sync);
  let mounted: HTMLElement | null = null,
    busy = false,
    status = 'Selecione conteúdo para gerar uma cópia independente.',
    armed = false,
    offset = 0;
  let downloadUrl: string | null = null;
  let currentSession: AccountSession | null = null;
  const selected = new Set<string>();
  const urls: string[] = [];
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function text(selector: string, value: string): void {
    const e = node(selector);
    if (e) e.textContent = value;
  }
  function clearView(): void {
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    node('[data-backup-view]')?.replaceChildren();
  }
  function clearDownload(): void {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    const link = node<HTMLAnchorElement>('[data-backup-download]');
    if (link) {
      link.hidden = true;
      link.removeAttribute('href');
    }
  }
  function render(): void {
    text('[data-backup-status]', status);
    mounted
      ?.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')
      .forEach((e) => {
        e.disabled = busy && !e.hasAttribute('data-backup-cancel');
      });
    const clean = node<HTMLButtonElement>('[data-backup-clean]');
    if (clean) {
      clean.disabled = busy || controller.cleanupCount === 0;
      clean.textContent = armed
        ? 'Confirmar limpeza somente do meu cofre'
        : 'Limpar itens preservados no backup';
    }
    const more = node('[data-backup-more]');
    if (more) more.hidden = !controller.more;
    const list = node('[data-backup-list]');
    if (!list) return;
    list.replaceChildren();
    const choices = controller.list();
    for (const row of choices.slice(offset, offset + 16)) {
      const label = document.createElement('label'),
        box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(`${row.type}:${row.id}`);
      box.disabled = busy;
      box.addEventListener('change', () => {
        const id = `${row.type}:${row.id}`;
        if (box.checked) selected.add(id);
        else selected.delete(id);
        armed = false;
        estimate();
      });
      label.append(box, document.createTextNode(row.label));
      list.append(label);
    }
    estimate();
    text(
      '[data-backup-page]',
      `${choices.length} itens carregados · mostrando ${Math.min(offset + 1, choices.length)}–${Math.min(offset + 16, choices.length)}. Novidades após a seleção ficam fora.`,
    );
  }
  function estimate(): void {
    const items = controller
        .list()
        .filter((r) => selected.has(`${r.type}:${r.id}`)),
      bytes = items.reduce((n, r) => n + r.bytes, 0);
    const media = node<HTMLInputElement>('[data-backup-media]')?.checked;
    const attachmentCount = items.filter(
      (r) => r.item?.kind === 'attachment',
    ).length;
    text(
      '[data-backup-estimate]',
      `${items.length} itens selecionados · estimativa conservadora: ${(((bytes + (media ? attachmentCount * 4_200_000 : 0)) * 1.1) / 1_000_000).toFixed(2)} MB. O tamanho final depende do conteúdo disponível. Até 64 MiB por arquivo; use mais de um arquivo se necessário.`,
    );
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      await work();
    } catch (error: unknown) {
      status =
        error instanceof Error
          ? error.message
          : 'Operação de backup interrompida.';
    } finally {
      busy = false;
      render();
    }
  }
  function action(selector: string, work: () => Promise<void>): void {
    node(selector)?.addEventListener('click', () => {
      void run(work);
    });
  }
  async function showRows(start = 0): Promise<void> {
    clearView();
    const reader = controller.opened,
      list = node('[data-backup-view]');
    if (!reader || !list) return;
    const guard = controller.guard();
    for (
      let i = start;
      i < Math.min(reader.report.records.length, start + 16);
      i++
    ) {
      guard();
      const row = await reader.read(i),
        article = document.createElement('article'),
        title = document.createElement('h3'),
        body = document.createElement('p');
      title.textContent = recordTitle(row);
      body.textContent = recordText(row);
      article.append(title, body);
      if (row.type === 'media') mediaButton(article, row);
      profilePhoto(article, row);
      list.append(article);
    }
    if (start + 16 < reader.report.records.length) {
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = 'Próximos itens do arquivo';
      next.addEventListener('click', () => {
        void run(() => showRows(start + 16));
      });
      list.append(next);
    }
    if (start > 0) {
      const first = document.createElement('button');
      first.type = 'button';
      first.textContent = 'Voltar ao início do arquivo';
      first.addEventListener('click', () => {
        void run(() => showRows());
      });
      list.append(first);
    }
  }
  function profilePhoto(article: HTMLElement, row: BackupRecord): void {
    if (row.type !== 'message' || row.kind !== 'profile') return;
    const photo = profileCard(JSON.parse(row.text) as unknown).photo;
    if (!photo) return;
    const url = URL.createObjectURL(
      new Blob([photo.bytes], { type: photo.type }),
    );
    urls.push(url);
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Foto do perfil preservada neste backup';
    image.className = 'profile-photo';
    article.append(image);
    photo.bytes.fill(0);
  }
  function recordTitle(row: BackupRecord): string {
    if (row.type === 'vault') return row.change.label;
    return row.type === 'media' ? 'Mídia preservada' : 'Mensagem histórica';
  }
  function recordText(row: BackupRecord): string {
    if (row.type === 'vault') return row.value;
    if (row.type === 'media')
      return 'Conteúdo cifrado disponível neste arquivo.';
    if (row.kind === 'text') return decodeDailyText(row.text).text;
    if (row.kind === 'attachment')
      return decodeDailyText(
        attachmentContent(JSON.parse(row.text) as unknown).caption,
      ).text;
    return `Perfil: ${profileCard(JSON.parse(row.text) as unknown).name}`;
  }
  function mediaButton(
    article: HTMLElement,
    row: Extract<BackupRecord, { type: 'media' }>,
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Salvar mídia deste backup';
    button.addEventListener('click', () => {
      void run(async () => {
        const reader = controller.opened;
        if (!reader) throw new Error('Backup fechado.');
        const index = reader.report.records.findIndex(
            (r) => r.type === 'message' && r.id === row.message,
          ),
          message = await reader.read(index);
        if (message.type !== 'message' || message.kind !== 'attachment')
          throw new Error('Descritor da mídia ausente.');
        const content = attachmentContent(JSON.parse(message.text) as unknown),
          file = row.thumbnail ? content.thumbnail : content.file;
        if (!file || file.ref.id !== row.id || file.ref.hash !== row.hash)
          throw new Error('Mídia divergente.');
        const bytes = await openStoredAttachment(
          file,
          Uint8Array.from(base64(row.bytes, 3_000_000)),
          row.thumbnail,
          row.thumbnail || content.image,
        );
        const url = URL.createObjectURL(
          new Blob([bytes], { type: 'application/octet-stream' }),
        );
        urls.push(url);
        bytes.fill(0);
        const link = document.createElement('a');
        link.href = url;
        link.download = row.thumbnail ? 'miniatura.png' : content.name;
        link.textContent = 'Baixar cópia da mídia';
        article.append(link);
      });
    });
    article.append(button);
  }
  function bind(): void {
    action('[data-backup-more]', async () => {
      await controller.discover();
      status =
        (await controller.reminder()) ??
        'Índice carregado. Escolha os itens; continue carregando se houver mais.';
    });
    action('[data-backup-generate]', async () => {
      clearDownload();
      clearView();
      armed = false;
      const report = await controller.generate(
        selected,
        node<HTMLInputElement>('[data-backup-media]')?.checked ?? false,
      );
      const file = controller.file;
      if (!file) throw new Error('Arquivo não concluído.');
      downloadUrl = URL.createObjectURL(file);
      const link = node<HTMLAnchorElement>('[data-backup-download]');
      if (link) {
        link.href = downloadUrl;
        link.download = `0xDMme-backup-${new Date().toISOString().slice(0, 10)}.0xdm`;
        link.hidden = false;
      }
      status = `${report.included} itens incluídos · ${report.omitted.length} omissões · ${(file.size / 1_000_000).toFixed(2)} MB. Salve o arquivo e selecione a cópia salva abaixo antes de limpar. ${report.omitted.join('; ')}`;
    });
    action('[data-backup-validate]', async () => {
      clearView();
      armed = false;
      const file = node<HTMLInputElement>('[data-backup-file]')?.files?.[0];
      if (!file) throw new Error('Selecione um arquivo salvo no aparelho.');
      const reader = await controller.open(file);
      status = `Arquivo validado localmente: ${reader.report.records.length} registros · ${reader.report.omitted.length} omissões. Nenhum conteúdo foi enviado ao servidor. ${controller.cleanupCount} itens desta exportação podem ser limpos. ${reader.report.omitted.join('; ')}`;
      await showRows();
    });
    action('[data-backup-clean]', async () => {
      if (!armed) {
        armed = true;
        status = `Confirme a remoção de ${controller.cleanupCount} itens somente do seu cofre. Seus aparelhos offline deixarão de recebê-los pelo servidor e dependerão deste arquivo. A outra pessoa mantém sua cópia. Mensagens com mídias omitidas ficam fora da limpeza.`;
        return;
      }
      armed = false;
      const result = await controller.cleanup();
      status = `Limpeza pessoal confirmada: ${(result.released / 1_000_000).toFixed(2)} MB lógicos liberados; uso após a transação ${(result.used / 1_000_000).toFixed(2)} MB. Bytes compartilhados permanecem enquanto necessários à outra pessoa. Metadados de integridade continuam contabilizados.`;
    });
    action('[data-backup-register]', async () => {
      await controller.register(
        node<HTMLInputElement>('[data-backup-remind]')?.checked ?? false,
      );
      status =
        'Hash e preferência de lembrete registrados cifrados no seu cofre. Não comprovam conservação futura do arquivo.';
    });
    node('[data-backup-cancel]')?.addEventListener('click', () => {
      controller.cancel();
      clearDownload();
      clearView();
      armed = false;
      status =
        'Operação interrompida. Confira o estado remoto se uma limpeza já havia sido confirmada.';
      render();
    });
    node('[data-backup-next]')?.addEventListener('click', () => {
      offset = offset + 16 < controller.list().length ? offset + 16 : 0;
      render();
    });
    node('[data-backup-all]')?.addEventListener('click', () => {
      for (const row of controller.list())
        selected.add(`${row.type}:${row.id}`);
      render();
    });
    node('[data-backup-none]')?.addEventListener('click', () => {
      selected.clear();
      render();
    });
    node('[data-backup-media]')?.addEventListener('change', estimate);
    node('[data-backup-file]')?.addEventListener('change', () => {
      armed = false;
      controller.opened?.close();
      clearView();
      render();
    });
  }
  window.addEventListener('0xdmme-backup-progress', (event) => {
    const d = (event as CustomEvent<{ done: number; total: number }>).detail;
    text(
      '[data-backup-status]',
      `Preparando ${d.done} de ${d.total}. Mantenha o app aberto; você pode cancelar.`,
    );
  });
  window.addEventListener('pagehide', () => {
    controller.cancel();
    clearDownload();
    clearView();
  });
  return {
    canActivate: () => !busy,
    setSession(session: AccountSession | null): void {
      const changed =
        session?.accountId !== currentSession?.accountId ||
        session?.deviceId !== currentSession?.deviceId ||
        session?.csrf !== currentSession?.csrf;
      currentSession = session;
      controller.setSession(session);
      if (!changed) return;
      selected.clear();
      armed = false;
      clearView();
      clearDownload();
      render();
    },
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = `<article class="card"><span class="eyebrow">BACKUP INDEPENDENTE</span><h2>Guarde uma cópia com você.</h2><p>Arquivo cifrado criado neste aparelho. Para abrir em outro navegador, entre com a wallet original e autorize ou recupere as chaves. A importação abre uma consulta histórica local; não altera aparelhos, bloqueios ou mensagens atuais.</p><p>Para guardar as versões de uma mensagem, selecione também suas edições e reações. Limpar a mensagem original do seu cofre oculta essas alterações nesta conta.</p><p data-backup-status role="status"></p><button data-backup-more type="button">Carregar / continuar seleção</button><p data-backup-page></p><div data-backup-list class="backup-list"></div><button data-backup-next type="button">Próxima página de seleção</button><button data-backup-all type="button">Selecionar itens carregados</button><button data-backup-none type="button">Limpar seleção</button><label><input data-backup-media type="checkbox" checked> Incluir fotos, arquivos e miniaturas disponíveis</label><p data-backup-estimate></p><button data-backup-generate class="primary" type="button">Gerar backup cifrado</button><button data-backup-cancel type="button">Cancelar / fechar backup</button><p><a data-backup-download hidden>Salvar arquivo de backup</a></p><h3>Abrir ou conferir o arquivo salvo</h3><label>Arquivo de backup<input data-backup-file type="file" accept=".0xdm,application/octet-stream"></label><button data-backup-validate type="button">Validar e abrir localmente</button><p>Salvar o arquivo não apaga nada. Confira e guarde sua cópia: perder o arquivo depois de limpar pode tornar o conteúdo irrecuperável para você. Mídias originais baixadas podem conter GPS/EXIF.</p><button data-backup-clean type="button" disabled>Limpar itens preservados no backup</button><label><input data-backup-remind type="checkbox"> Lembrar de exportar após sete dias, ao abrir o cofre</label><button data-backup-register type="button">Registrar hash validado e preferência de lembrete</button><div data-backup-view class="backup-history"></div></article>`;
      bind();
      render();
    },
  };
}
export { Backups } from './controller.ts';
