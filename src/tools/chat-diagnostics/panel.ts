import { PairingControls } from './pairing-controls.ts';

interface PanelOptions {
  native: boolean;
  pair: (code?: string) => string;
  mark: () => void;
  finish: () => void;
  status: () => { label: string; canPair: boolean; configured: boolean };
}

/** Optional controls own their DOM and timer. Hiding them leaves capture active. */
export class DiagnosticPanel {
  private readonly element = document.createElement('aside');
  private readonly label = document.createElement('div');
  private readonly pairing: PairingControls;
  private readonly options: PanelOptions;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: PanelOptions) {
    this.options = options;
    this.pairing = new PairingControls(options.pair);
    this.element.setAttribute('aria-label', 'Local synchronization meter');
    this.element.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:2147483647;padding:12px;border:1px solid GrayText;background:Canvas;color:CanvasText;font:13px system-ui;max-width:min(260px,calc(100vw - 16px));max-height:calc(100dvh - 16px);box-sizing:border-box;overflow:auto;box-shadow:0 2px 8px GrayText;';
    this.element.append(
      button('Hide controls', () => this.hide()),
      this.label,
      this.pairing.element,
      button('Mark delay', options.mark),
      button(
        options.native ? 'Stop capture' : 'Stop and download report',
        options.finish,
      ),
    );
  }

  show(): void {
    if (this.element.isConnected) return;
    clearInterval(this.timer);
    this.refresh();
    document.body.append(this.element);
    this.timer = setInterval(() => this.refresh(), 1000);
  }

  hide(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.element.remove();
  }

  close(): void {
    this.hide();
    this.pairing.stop();
  }

  private refresh(): void {
    const status = this.options.status();
    if (this.label.textContent !== status.label)
      this.label.textContent = status.label;
    this.pairing.update(status.canPair, status.configured);
  }
}

function button(text: string, action: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = text;
  control.onclick = action;
  return control;
}
