import { Wallet } from 'ethers';

// Disposable wallet created only in this test browser. No private key leaves it.
const wallet = Wallet.createRandom();
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
// Load the exact built app after provider initialization, with no injected eval.
const script = document.createElement('script');
script.type = 'module';
script.src = document.documentElement.dataset['testApp'] ?? '';
document.head.append(script);
