import encodeQR from 'qr';

// Opt-in loopback fixture: synthetic frames only, never opens a physical camera.
export function syntheticQrCamera(): void {
  const panel = document.createElement('details');
  const title = document.createElement('summary');
  title.textContent = 'Fixture: câmera QR sintética';
  const label = document.createElement('label');
  label.textContent = 'Conteúdo público do QR sintético';
  const input = document.createElement('textarea');
  input.setAttribute('aria-label', label.textContent);
  label.append(input);
  const status = document.createElement('p');
  const canvas = document.createElement('canvas');
  let stops = 0;
  const getUserMedia = () => {
    const value = input.value;
    if (!value || value.length > 2000)
      return Promise.reject(new Error('QR sintético ausente.'));
    const matrix = encodeQR(value, 'raw', { border: 4 });
    canvas.width = canvas.height = matrix.length * 5;
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new Error('Canvas indisponível.'));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    matrix.forEach((row, y) => drawRow(context, row, y));
    const stream = canvas.captureStream(4);
    stream.getTracks().forEach((track) => {
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        stops += 1;
        status.textContent = `Tracks sintéticas encerradas: ${stops}`;
      };
    });
    return Promise.resolve(stream);
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  panel.append(title, label, status);
  document.body.prepend(panel);
}
function drawRow(
  context: CanvasRenderingContext2D,
  row: boolean[],
  y: number,
): void {
  row.forEach((black, x) => {
    if (black) context.fillRect(x * 5, y * 5, 5, 5);
  });
}
