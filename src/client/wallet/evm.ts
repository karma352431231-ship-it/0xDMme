export interface EvmProvider {
  request: (request: {
    method:
      'eth_requestAccounts' | 'eth_accounts' | 'eth_chainId' | 'personal_sign';
    params?: string[];
  }) => Promise<unknown>;
  on?: (event: string, listener: () => void) => void;
  removeListener?: (event: string, listener: () => void) => void;
}
export function evmProvider(value: unknown): EvmProvider | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('request' in value) ||
    typeof value.request !== 'function'
  )
    return;
  return value as EvmProvider;
}
export async function evmIdentity(
  instance: EvmProvider,
  requestAccess: boolean,
) {
  const accounts = await instance.request({
    method: requestAccess ? 'eth_requestAccounts' : 'eth_accounts',
  });
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== 'string' ||
    !/^0x[0-9a-fA-F]{40}$/u.test(accounts[0])
  )
    throw new Error('Selecione uma conta EVM na wallet.');
  const chain = await instance.request({ method: 'eth_chainId' });
  if (typeof chain !== 'string' || !/^0x[0-9a-fA-F]{1,8}$/u.test(chain))
    throw new Error('Rede EVM inválida.');
  const chainId = Number.parseInt(chain.slice(2), 16);
  if (chainId < 1 || chainId > 2_147_483_647)
    throw new Error('Rede EVM inválida.');
  return { address: accounts[0], chainId, ecosystem: 'evm' as const };
}
export async function signEvm(
  instance: EvmProvider,
  message: string,
  address: string,
): Promise<string> {
  const hex = `0x${Array.from(new TextEncoder().encode(message), (value) => value.toString(16).padStart(2, '0')).join('')}`;
  const signature = await instance.request({
    method: 'personal_sign',
    params: [hex, address],
  });
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/u.test(signature))
    throw new Error('Assinatura EVM inválida.');
  return signature;
}
