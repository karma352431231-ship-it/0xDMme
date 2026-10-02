import { decodeQrFrame, readQrPayload } from './codec.ts';
import type { QrKind } from './codec.ts';

interface CameraOptions {
  video: HTMLVideoElement;
  state: (active: boolean) => void;
  decoded: (value: string, kind: QrKind) => void;
  failed: (message: string) => void;
}
export class QrCamera {
  active = false;
  private generation = 0;
  private stream: MediaStream | null = null;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private frameTimer: ReturnType<typeof setTimeout> | undefined;
  private canvas = document.createElement('canvas');
  private options: CameraOptions;
  constructor(options: CameraOptions) {
    this.options = options;
  }

  start(kind: QrKind): void {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.options.failed(
        'Câmera indisponível. Use HTTPS e permita a câmera, ou copie o código.',
      );
      return;
    }
    this.active = true;
    const generation = this.generation;
    this.options.state(true);
    this.deadline = setTimeout(() => {
      this.fail(
        'O prazo para abrir a câmera terminou. Tente novamente ou copie o código.',
      );
    }, 10_000);
    void this.open(kind, generation).catch(() => {
      if (this.active && generation === this.generation)
        this.fail(
          'Não foi possível ler pela câmera. Confira a permissão ou copie o código.',
        );
    });
  }
  private async open(kind: QrKind, generation: number): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (!this.active || generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    stream.getVideoTracks().forEach((track) =>
      track.addEventListener(
        'ended',
        () => {
          if (this.active && generation === this.generation)
            this.fail(
              'A câmera foi encerrada. Tente novamente ou copie o código.',
            );
        },
        { once: true },
      ),
    );
    const video = this.options.video;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (!this.active || generation !== this.generation) return;
    clearTimeout(this.deadline);
    this.deadline = setTimeout(
      () => this.fail('Leitura encerrada após um minuto. Tente novamente.'),
      60_000,
    );
    this.tick(kind, generation);
  }
  private tick(kind: QrKind, generation: number): void {
    if (!this.active || generation !== this.generation) return;
    try {
      const payload = this.frame();
      if (payload !== null) {
        const value = readQrPayload(payload, kind);
        this.stop();
        this.options.decoded(value, kind);
        return;
      }
      this.frameTimer = setTimeout(() => this.tick(kind, generation), 250);
    } catch {
      this.fail(
        'Não foi possível ler este QR Code. Use o QR desta etapa ou copie o código.',
      );
    }
  }
  private frame(): string | null {
    const video = this.options.video;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
      return null;
    const scale = Math.min(
      1,
      960 / Math.max(video.videoWidth, video.videoHeight),
    );
    this.canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
    this.canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Leitor indisponível.');
    context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    return decodeQrFrame(
      context.getImageData(0, 0, this.canvas.width, this.canvas.height),
    );
  }
  private fail(message: string): void {
    this.stop();
    this.options.failed(message);
  }
  stop(): void {
    this.generation += 1;
    clearTimeout(this.deadline);
    clearTimeout(this.frameTimer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.options.video.pause();
    this.options.video.srcObject = null;
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.active = false;
    this.options.state(false);
  }
}
