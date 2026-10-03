import { Wallet } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { syntheticQrCamera } from './qr-camera.ts';
import { syntheticVaultControls } from './vault-browser.ts';
import { syntheticRecoveryControls } from './recovery-browser.ts';

// Explicitly fictitious seed supplied only by the loopback test fixture. It
// permits independent origins to exercise the same account and survive reload.
// Never use a real wallet here; this module is absent from the product build.
declare const SYNTHETIC_FIXTURE_SEED: string;
declare const SYNTHETIC_QR_CAMERA: boolean;
declare const SYNTHETIC_VAULT_CONTROLS: boolean;
declare const SYNTHETIC_RECOVERY_CONTROLS: boolean;
if (SYNTHETIC_RECOVERY_CONTROLS) syntheticRecoveryControls();
if (SYNTHETIC_QR_CAMERA) syntheticQrCamera();
if (SYNTHETIC_VAULT_CONTROLS) syntheticVaultControls();
const wallet = new Wallet(SYNTHETIC_FIXTURE_SEED);
const provider = {
  isMetaMask: true,
  request(input: { method: string; params?: string[] }): Promise<unknown> {
    if (
      input.method === 'eth_accounts' ||
      input.method === 'eth_requestAccounts'
    )
      return Promise.resolve([wallet.address]);
    if (input.method === 'eth_chainId') return Promise.resolve('0x1');
    if (input.method === 'personal_sign') {
      const message = input.params?.[0];
      if (!message || !/^0x[0-9a-f]+$/u.test(message))
        return Promise.reject(new Error('Pedido sintético inválido.'));
      return wallet.signMessage(
        Uint8Array.from(message.slice(2).match(/.{2}/gu) ?? [], (byte) =>
          Number.parseInt(byte, 16),
        ),
      );
    }
    return Promise.reject(new Error('Método não permitido no teste.'));
  },
};
Object.assign(window, { ethereum: provider });
const solanaKey = crypto.getRandomValues(new Uint8Array(32));
const solanaAddress = base58.encode(ed25519.getPublicKey(solanaKey));
const solanaProvider = {
  isPhantom: true,
  publicKey: { toBase58: () => solanaAddress },
  connect: () =>
    Promise.resolve({ publicKey: { toBase58: () => solanaAddress } }),
  signMessage: (message: Uint8Array) =>
    Promise.resolve({ signature: ed25519.sign(message, solanaKey) }),
};
Object.assign(window, { phantom: { solana: solanaProvider } });
// Load the exact built app after provider initialization, with no injected eval.
const script = document.createElement('script');
script.type = 'module';
script.src = document.documentElement.dataset['testApp'] ?? '';
document.head.append(script);
