/** Operator-only pairing UI. Codes remain in this local control and never enter
 * recording events or reports. The app acknowledges the derived fingerprint. */
export class PairingControls {
  readonly element = document.createElement('fieldset');
  private readonly code = document.createElement('input');
  private readonly create = document.createElement('button');
  private readonly use = document.createElement('button');
  private readonly copy = document.createElement('button');
  private readonly help = document.createElement('small');
  private stopped = false;
  constructor(pair: (code?: string) => string) {
    const legend = document.createElement('legend');
    legend.textContent = 'Link the sender and recipient captures';
    this.code.placeholder = 'Paste the sender pairing code here';
    this.code.setAttribute('aria-label', 'Temporary pairing code');
    this.code.style.cssText =
      'width:100%;box-sizing:border-box;font:12px monospace;';
    this.create.textContent = 'Sender: create code';
    this.use.textContent = 'Recipient: use code';
    this.copy.textContent = 'Copy code';
    this.help.textContent =
      'Create on sender, copy to recipient, then use it there. Wait for the same fingerprint and Ready locally on both.';
    for (const button of [this.create, this.use, this.copy])
      button.type = 'button';
    this.create.onclick = () => this.apply(pair);
    this.use.onclick = () => this.apply(() => pair(this.code.value.trim()));
    this.copy.onclick = () => this.copyCode();
    this.element.append(
      legend,
      this.help,
      this.code,
      this.create,
      this.copy,
      this.use,
    );
  }
  private apply(pair: () => string): void {
    try {
      this.code.value = pair();
      this.create.disabled = this.use.disabled = true;
      this.code.readOnly = true;
    } catch {
      this.help.textContent =
        'Pairing unavailable: check app compatibility and start a fresh capture before trying again.';
    }
  }
  private copyCode(): void {
    const code = this.code.value;
    if (!code || this.stopped) return;
    if (!navigator.clipboard) {
      this.code.select();
      return;
    }
    void navigator.clipboard.writeText(code).then(
      () => {
        if (!this.stopped)
          this.help.textContent =
            'Code copied on this device. Paste it into the recipient capture and choose Use code.';
      },
      () => {
        if (!this.stopped) this.code.select();
      },
    );
  }
  update(available: boolean, configured: boolean): void {
    this.create.disabled = this.use.disabled =
      this.stopped || !available || configured;
    this.code.readOnly = configured || this.stopped;
    this.copy.disabled = this.stopped || !this.code.value;
  }
  stop(): void {
    this.stopped = true;
    this.code.value = '';
    this.update(false, true);
  }
}
