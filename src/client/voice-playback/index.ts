import { AccountError } from '../../shared/account/index.ts';
import { validateVoice, voiceDuration } from '../../shared/voice/index.ts';
import type { VoiceMetadata } from '../../shared/voice/index.ts';
/** Owns a single deliberate playback outside the chat DOM; refresh/deletion never touches it. */
export class VoicePlayback {
  private player: HTMLAudioElement | null = null;
  private host: HTMLElement | null = null;
  private url: string | null = null;
  private generation = 0;
  private identity: { id: string; peer: string | null } | null = null;
  private checking: Promise<void> | null = null;
  private recheck = false;
  get open(): boolean {
    return this.player !== null;
  }
  get peer(): string | null {
    return this.identity?.peer ?? null;
  }
  show(input: {
    bytes: Uint8Array<ArrayBuffer>;
    voice: VoiceMetadata;
    id: string;
    peer: string | null;
  }): void {
    validateVoice(input.bytes, input.voice);
    if (
      this.identity?.id === input.id &&
      this.identity.peer === input.peer &&
      this.player
    ) {
      this.player.focus();
      return;
    }
    this.close();
    const host = document.createElement('aside'),
      title = document.createElement('p'),
      player = document.createElement('audio'),
      close = document.createElement('button');
    host.className = 'voice-player card';
    host.setAttribute('aria-label', 'Mensagem de voz aberta');
    title.textContent = `Mensagem de voz · ${voiceDuration(input.voice)}`;
    player.controls = true;
    player.preload = 'metadata';
    player.setAttribute('aria-label', 'Reproduzir mensagem de voz');
    this.url = URL.createObjectURL(
      new Blob([input.bytes], { type: 'audio/wav' }),
    );
    player.src = this.url;
    close.type = 'button';
    close.textContent = 'Fechar áudio';
    close.addEventListener('click', () => this.close());
    host.append(title, player, close);
    let dock = document.getElementById('voice-playbacks');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'voice-playbacks';
      document.body.append(dock);
    }
    dock.append(host);
    this.player = player;
    this.host = host;
    this.identity = { id: input.id, peer: input.peer };
    player.focus();
  }
  check(allowed: (peer: string) => Promise<boolean>): Promise<void> {
    this.recheck = true;
    if (this.checking) return this.checking;
    const check = async () => {
      while (this.recheck) {
        this.recheck = false;
        const peer = this.peer,
          generation = this.generation;
        if (!peer) return;
        await this.verifyPermission(allowed, { peer, generation });
        // A later source must never inherit the result for the previous source.
        if (generation !== this.generation && this.peer) this.recheck = true;
      }
    };
    this.checking = check().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }
  private async verifyPermission(
    allowed: (peer: string) => Promise<boolean>,
    context: { peer: string; generation: number },
  ): Promise<void> {
    try {
      const valid = await allowed(context.peer);
      if (context.generation === this.generation && !valid) this.close();
    } catch (error: unknown) {
      if (context.generation !== this.generation) return;
      // A stale directory can also return 403; only a verified session end or
      // a negative block check ends playback here. Revocation has its own event.
      if (error instanceof AccountError && error.status === 401) this.close();
      else
        this.host?.setAttribute(
          'aria-description',
          'Não foi possível conferir a autorização agora. Uma nova atualização tentará novamente.',
        );
    }
  }
  close(): void {
    this.generation++;
    this.recheck = false;
    this.player?.pause();
    this.player?.removeAttribute('src');
    this.player?.load();
    this.player = null;
    this.host?.remove();
    this.host = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.identity = null;
  }
}
