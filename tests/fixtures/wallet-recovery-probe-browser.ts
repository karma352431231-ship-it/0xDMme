import { Wallet, getBytes, hashMessage, hexlify } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import type { getWallets } from '@wallet-standard/app';

// Public, disposable fixture keys. This entry is served only with --synthetic
// on the standalone loopback lab, never in the app or the real-wallet bundle.
const evm = [1, 2].map(
  (value) => new Wallet(`0x${value.toString(16).padStart(64, '0')}`),
);
const solana = [7, 8].map((value) => new Uint8Array(32).fill(value));
const panel = document.createElement('section');
panel.innerHTML =
  '<h2>Modo fictício — nenhuma wallet real</h2><label for="fixture-account">Conta fictícia</label><select id="fixture-account"><option value="0">Conta A</option><option value="1">Conta B</option></select><label for="fixture-signing">Assinatura EVM fictícia</label><select id="fixture-signing"><option value="stable">Estável</option><option value="variable">Variável e válida</option></select>';
document.querySelector('main')?.prepend(panel);
const account = panel.querySelector<HTMLSelectElement>('#fixture-account');
const signing = panel.querySelector<HTMLSelectElement>('#fixture-signing');
function evmAccount(): Wallet {
  const wallet = evm[Number(account?.value ?? 0)];
  if (!wallet) throw new Error('Conta fictícia inválida.');
  return wallet;
}
const provider = {
  async request(input: {
    method: string;
    params?: string[];
  }): Promise<unknown> {
    const wallet = evmAccount();
    if (
      input.method === 'eth_accounts' ||
      input.method === 'eth_requestAccounts'
    )
      return [wallet.address];
    if (input.method === 'eth_chainId') return '0x1';
    if (input.method !== 'personal_sign')
      throw new Error('Método fora do ensaio.');
    const message = getBytes(input.params?.[0] ?? '');
    if (signing?.value !== 'variable') return wallet.signMessage(message);
    const signature = secp256k1.sign(
      getBytes(hashMessage(message)),
      getBytes(wallet.privateKey),
      { extraEntropy: true },
    );
    return `${hexlify(signature.toCompactRawBytes())}${(27 + signature.recovery).toString(16)}`;
  },
};
function announce(): void {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: '7b21e786-fb5d-42a8-9215-4bb37b6c8869',
          name: 'Wallet fictícia EVM',
          rdns: 'test.invalid',
        },
        provider,
      },
    }),
  );
}
window.addEventListener('eip6963:requestProvider', announce);
function solanaKey(): Uint8Array {
  const key = solana[Number(account?.value ?? 0)];
  if (!key) throw new Error('Conta fictícia inválida.');
  return key;
}
function solanaAccount() {
  const publicKey = ed25519.getPublicKey(solanaKey());
  return {
    address: base58.encode(publicKey),
    publicKey,
    chains: ['solana:mainnet'] as const,
    features: ['solana:signMessage'] as const,
  };
}
type RegistrationApi = Pick<ReturnType<typeof getWallets>, 'register'>;
const standardWallet: Parameters<RegistrationApi['register']>[0] = {
  version: '1.0.0',
  name: 'Wallet fictícia Solana',
  icon: 'data:image/svg+xml;base64,PHN2Zy8+',
  chains: ['solana:mainnet'],
  get accounts() {
    return [solanaAccount()];
  },
  features: {
    'standard:connect': {
      version: '1.0.0',
      connect: () => Promise.resolve({ accounts: [solanaAccount()] }),
    },
    'solana:signMessage': {
      version: '1.0.0',
      signMessage: (input: {
        account: { address: string };
        message: Uint8Array;
      }) => {
        if (input.account.address !== solanaAccount().address)
          return Promise.reject(new Error('Conta fictícia mudou.'));
        return Promise.resolve([
          {
            signedMessage: input.message,
            signature: ed25519.sign(input.message, solanaKey()),
            signatureType: 'ed25519',
          },
        ]);
      },
    },
  },
};
// Use the Wallet Standard window handshake: the fixture and app are separate
// bundles, so a fixture-local registry would not represent extension discovery.
function register(api: RegistrationApi): void {
  api.register(standardWallet);
}
window.addEventListener('wallet-standard:app-ready', (event) => {
  if ('detail' in event) register(event.detail as RegistrationApi);
});
window.dispatchEvent(
  new CustomEvent('wallet-standard:register-wallet', { detail: register }),
);
const script = document.createElement('script');
script.type = 'module';
script.src = '/probe.js';
document.head.append(script);
