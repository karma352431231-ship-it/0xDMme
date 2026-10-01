import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isIP } from 'node:net';
import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  timingSafeEqual,
} from 'node:crypto';
import {
  AccountError,
  boundedText,
  keys,
  object,
} from '../../shared/account/index.ts';

export function mobileWebAddress(value: unknown): string {
  const address = boundedText(value, 15);
  if (isIP(address) !== 4)
    throw new AccountError(400, 'Endereço privado IPv4 necessário.');
  const [first, second] = address.split('.').map(Number);
  const privateAddress =
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31);
  if (!privateAddress)
    throw new AccountError(400, 'A base mobile exige rede privada.');
  return address;
}

export async function readMobileWebConfiguration() {
  const config = object(
    JSON.parse(
      await readFile(
        new URL('../../../.local/mobile-probe.json', import.meta.url),
        'utf8',
      ),
    ) as unknown,
  );
  keys(config, ['address']);
  const address = mobileWebAddress(config['address']);
  const root = new URL('../../../.local/mobile-tls/', import.meta.url);
  const [cert, key] = await Promise.all([
    readFile(new URL('server.pem', root)),
    readFile(new URL('server.key', root)),
  ]);
  const certificate = new X509Certificate(cert);
  if (
    certificate.checkIP(address) !== address ||
    Date.parse(certificate.validTo) <= Date.now() ||
    Date.parse(certificate.validFrom) > Date.now()
  )
    throw new Error('Certificado mobile inválido ou expirado.');
  const publicKey = certificate.publicKey.export({
    type: 'spki',
    format: 'der',
  });
  const suppliedKey = createPublicKey(createPrivateKey(key)).export({
    type: 'spki',
    format: 'der',
  });
  if (
    publicKey.length !== suppliedKey.length ||
    !timingSafeEqual(publicKey, suppliedKey)
  )
    throw new Error('Chave TLS incorreta.');
  return {
    address,
    port: 45112,
    origin: `https://${address}:45112`,
    tls: { cert, key },
  };
}

/** Network coordinates remain exclusively in .local, never console or Git. */
export async function recordMobileWebEntry(origin: string): Promise<void> {
  const root = new URL('../../../.local/', import.meta.url);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(
    new URL('WEB_MOBILE_ACESSO.md', root),
    `# Base web mobile temporária\n\nURL: ${origin}/#configuracoes\n\nSomente dados sintéticos. Banco exclusivo de testes. Listener limitado a uma hora.\n`,
    { mode: 0o600 },
  );
}
