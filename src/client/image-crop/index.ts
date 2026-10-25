import { t } from '../../shared/i18n/index.ts';
import { showToast } from '../toast/index.ts';
import { layoutLength } from '../display-scale/index.ts';

/** Frame of the chosen picture: its proportion, its look and the saved size. */
export interface CropShape {
  aspect: number;
  round: boolean;
  width: number;
  height: number;
}
export const avatarCrop: CropShape = {
  aspect: 1,
  round: true,
  width: 800,
  height: 800,
};
export const squareCrop: CropShape = { ...avatarCrop, round: false };
export const bannerCrop: CropShape = {
  aspect: 3,
  round: false,
  width: 1500,
  height: 500,
};

const maxZoom = 4;
const svgNs = 'http://www.w3.org/2000/svg';

/**
 * X-style framing before a photo or banner is saved (16/10/2026): drag to
 * move, slider, wheel or pinch to zoom, arrows and +/- from the keyboard.
 * Everything happens on this device; the framed copy then follows the same
 * preparation as any chosen picture. Cancel resolves to null.
 */
export async function cropImage(
  file: File,
  shape: CropShape,
): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return await new CropDialog(image, shape).result(file);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Invalid image.'));
    image.src = url;
  });
}

class CropDialog {
  private readonly image: HTMLImageElement;
  private readonly shape: CropShape;
  private readonly dialog: HTMLDialogElement;
  private readonly stage: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly zoomInput: HTMLInputElement;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private frameWidth = 0;
  private frameHeight = 0;
  private zoom = 1;
  private x = 0;
  private y = 0;
  private pinch = 0;

  constructor(image: HTMLImageElement, shape: CropShape) {
    this.image = image;
    this.shape = shape;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'image-crop-dialog';
    this.dialog.setAttribute('aria-label', t('crop.title'));
    this.stage = document.createElement('div');
    this.stage.className = 'image-crop-stage';
    this.stage.tabIndex = 0;
    this.stage.setAttribute('aria-label', t('crop.stage'));
    this.frame = document.createElement('div');
    this.frame.className = 'image-crop-frame';
    this.frame.dataset['round'] = String(shape.round);
    image.className = 'image-crop-image';
    image.alt = '';
    image.draggable = false;
    this.stage.append(image, this.frame);
    this.zoomInput = document.createElement('input');
    this.zoomInput.type = 'range';
    this.zoomInput.min = '1';
    this.zoomInput.max = String(maxZoom);
    this.zoomInput.step = '0.01';
    this.zoomInput.value = '1';
    this.zoomInput.setAttribute('aria-label', t('crop.zoom'));
  }

  result(file: File): Promise<File | null> {
    return new Promise((resolve) => {
      const apply = button(t('crop.apply'), 'image-crop-apply');
      const cancel = button(t('crop.cancel'), 'image-crop-cancel');
      const header = document.createElement('header');
      const title = document.createElement('strong');
      title.textContent = t('crop.title');
      header.append(cancel, title, apply);
      this.dialog.append(header, this.stage, this.zoomBar());
      document.body.append(this.dialog);
      const finish = (value: File | null) => {
        window.removeEventListener('resize', this.layout);
        this.dialog.close();
        this.dialog.remove();
        resolve(value);
      };
      cancel.addEventListener('click', () => finish(null));
      this.dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
      });
      apply.addEventListener('click', () => {
        apply.disabled = true;
        void this.render(file)
          .then(finish)
          .catch(() => {
            showToast(t('crop.failed'));
            finish(null);
          });
      });
      this.bindGestures();
      window.addEventListener('resize', this.layout);
      this.dialog.showModal();
      this.layout();
      this.stage.focus();
    });
  }

  private zoomBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'image-crop-zoom';
    const out = iconButton('M5 12h14', t('crop.zoom-out'));
    const more = iconButton('M12 5v14M5 12h14', t('crop.zoom-in'));
    out.addEventListener('click', () => this.setZoom(this.zoom - 0.25));
    more.addEventListener('click', () => this.setZoom(this.zoom + 0.25));
    this.zoomInput.addEventListener('input', () =>
      this.setZoom(Number(this.zoomInput.value)),
    );
    bar.append(out, this.zoomInput, more);
    return bar;
  }

  /** Frame size follows the stage; the picture covers the frame at zoom 1. */
  private readonly layout = (): void => {
    const box = this.stage.getBoundingClientRect(),
      boxWidth = layoutLength(box.width, this.stage),
      boxHeight = layoutLength(box.height, this.stage);
    const room = Math.max(120, Math.min(boxWidth, boxHeight) - 32);
    const wide = this.shape.aspect >= 1;
    const width = wide
      ? Math.min(boxWidth - 32, room * this.shape.aspect)
      : room * this.shape.aspect;
    this.frameWidth = Math.max(120, width);
    this.frameHeight = this.frameWidth / this.shape.aspect;
    this.frame.style.width = `${this.frameWidth}px`;
    this.frame.style.height = `${this.frameHeight}px`;
    this.paint();
  };

  private cover(): number {
    return Math.max(
      this.frameWidth / this.image.naturalWidth,
      this.frameHeight / this.image.naturalHeight,
    );
  }

  private setZoom(value: number): void {
    this.zoom = Math.min(maxZoom, Math.max(1, value));
    this.zoomInput.value = String(this.zoom);
    this.paint();
  }

  private move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.paint();
  }

  /** Keeps the picture covering the whole frame, then draws it. */
  private paint(): void {
    const scale = this.cover() * this.zoom;
    const spareX = (this.image.naturalWidth * scale - this.frameWidth) / 2;
    const spareY = (this.image.naturalHeight * scale - this.frameHeight) / 2;
    this.x = Math.max(-spareX, Math.min(spareX, this.x));
    this.y = Math.max(-spareY, Math.min(spareY, this.y));
    this.image.style.transform = `translate(-50%, -50%) translate(${this.x}px, ${this.y}px) scale(${scale})`;
  }

  private bindGestures(): void {
    this.stage.addEventListener('pointerdown', (event) => {
      this.stage.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      this.pinch = this.spread();
    });
    this.stage.addEventListener('pointermove', (event) => this.drag(event));
    for (const name of ['pointerup', 'pointercancel'] as const)
      this.stage.addEventListener(name, (event) => {
        this.pointers.delete(event.pointerId);
        this.pinch = this.spread();
      });
    this.stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.setZoom(this.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
      },
      { passive: false },
    );
    this.stage.addEventListener('keydown', (event) => this.key(event));
  }

  private drag(event: PointerEvent): void {
    const last = this.pointers.get(event.pointerId);
    if (!last) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size > 1) {
      const spread = this.spread();
      if (this.pinch) this.setZoom(this.zoom * (spread / this.pinch));
      this.pinch = spread;
      return;
    }
    this.move(
      layoutLength(event.clientX - last.x, this.stage),
      layoutLength(event.clientY - last.y, this.stage),
    );
  }

  /** Distance between two touches, for pinch zoom; 0 with fewer. */
  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private key(event: KeyboardEvent): void {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [12, 0],
      ArrowRight: [-12, 0],
      ArrowUp: [0, 12],
      ArrowDown: [0, -12],
    };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      this.move(step[0], step[1]);
    } else if (event.key === '+' || event.key === '=')
      this.setZoom(this.zoom + 0.1);
    else if (event.key === '-') this.setZoom(this.zoom - 0.1);
  }

  /** The framed area at the saved size; PNG keeps transparency, others become JPEG. */
  private async render(file: File): Promise<File> {
    const scale = this.cover() * this.zoom;
    const width = this.frameWidth / scale,
      height = this.frameHeight / scale;
    const left = this.image.naturalWidth / 2 - this.x / scale - width / 2;
    const top = this.image.naturalHeight / 2 - this.y / scale - height / 2;
    const canvas = document.createElement('canvas');
    canvas.width = this.shape.width;
    canvas.height = this.shape.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Local image processing unavailable.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      this.image,
      left,
      top,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, type, 0.92),
    );
    if (!blob) throw new Error('Local image processing unavailable.');
    const stem = file.name.replace(/\.[^.]+$/u, '') || 'image';
    return new File([blob], `${stem}.${type === 'image/png' ? 'png' : 'jpg'}`, {
      type,
    });
  }
}

function button(label: string, className: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  return node;
}

function iconButton(d: string, label: string): HTMLButtonElement {
  const node = button('', 'image-crop-step');
  node.setAttribute('aria-label', label);
  node.title = label;
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  node.append(svg);
  return node;
}
