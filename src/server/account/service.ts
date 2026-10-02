import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  challengeMessage,
  loginIdentity,
  verifyChallenge,
} from './signature.ts';
import {
  canonicalAddress,
  ecosystem,
} from '../../shared/wallet-identity/index.ts';
import {
  AccountError,
  boundedText,
  displayName,
  keys,
  object,
  profileEnvelope,
  uuid,
} from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import type { AuthenticationStore } from '../database/index.ts';
import { walletApprovalRequest } from '../../shared/wallet-approval/index.ts';

export const challengeSeconds = 300;
export const sessionSeconds = 43_200;

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function token(): string {
  return randomBytes(32).toString('hex');
}

function validatedEcosystem(value: unknown) {
  try {
    return ecosystem(value);
  } catch {
    throw new AccountError(400, 'Ecossistema inválido.');
  }
}

export class AccountService {
  private readonly store: AuthenticationStore;
  private readonly origin: string;
  constructor(options: { store: AuthenticationStore; origin: string }) {
    this.store = options.store;
    this.origin = options.origin;
  }

  async challenge(input: unknown) {
    return this.issueChallenge(loginIdentity(input));
  }

  private async issueChallenge(
    identity: ReturnType<typeof loginIdentity>,
    handoffHash?: string,
    deadline?: Date,
  ) {
    const { deviceId } = identity;
    const id = randomUUID();
    const browserToken = token();
    const now = new Date();
    const expiresAt =
      deadline ?? new Date(now.getTime() + challengeSeconds * 1000);
    const message = challengeMessage({
      ...identity,
      origin: this.origin,
      handoff: handoffHash !== undefined,
      nonce: token(),
      issuedAt: now,
      expiresAt,
      id,
      deviceId,
    });
    await this.store.createChallenge({
      id,
      browserHash: tokenHash(browserToken),
      address: canonicalAddress(identity.ecosystem, identity.address),
      ecosystem: identity.ecosystem,
      ...(handoffHash ? { handoffHash } : {}),
      deviceId,
      message,
      expiresAt,
    });
    return { id, message, expiresAt: expiresAt.toISOString(), browserToken };
  }

  async login(input: unknown, browserToken: string, previousToken?: string) {
    const data = object(input);
    keys(data, ['id', 'signature']);
    const challenge = await this.store.claimAttempt(
      uuid(data['id']),
      tokenHash(browserToken),
    );
    if (challenge.handoffHash)
      throw new AccountError(
        401,
        'Pedido exige confirmação no navegador original.',
      );
    verifyChallenge(challenge, data['signature'], this.origin);
    const sessionToken = token();
    await this.store.finishLogin({
      challenge,
      tokenHash: tokenHash(sessionToken),
      csrf: token(),
      expiresAt: new Date(Date.now() + sessionSeconds * 1000),
      ...(previousToken ? { previousTokenHash: tokenHash(previousToken) } : {}),
    });
    return { sessionToken, session: await this.session(sessionToken) };
  }

  async startHandoff(input: unknown, previousBrowserToken: string) {
    const data = object(input);
    keys(data, ['ecosystem', 'deviceId']);
    const network = validatedEcosystem(data['ecosystem']);
    const deviceId = uuid(data['deviceId']);
    const browserToken = token();
    const ticket = token();
    const expiresAt = new Date(Date.now() + challengeSeconds * 1000);
    if (previousBrowserToken)
      await this.store.cancelHandoff(tokenHash(previousBrowserToken));
    await this.store.createHandoff({
      browserHash: tokenHash(browserToken),
      ticketHash: tokenHash(ticket),
      ecosystem: network,
      deviceId,
      expiresAt,
    });
    return { ticket, browserToken, expiresAt: expiresAt.toISOString() };
  }
  async handoffChallenge(input: unknown) {
    const data = object(input);
    keys(data, ['ticket', 'address', 'chainId']);
    const hash = tokenHash(this.handoffTicket(data['ticket']));
    const handoff = await this.store.handoffByTicket(hash);
    const identity = loginIdentity({
      address: data['address'],
      chainId: data['chainId'],
      ecosystem: handoff.ecosystem,
      deviceId: handoff.deviceId,
    });
    return this.issueChallenge(identity, hash, handoff.expiresAt);
  }
  async approvalRequest(input: unknown) {
    let request;
    try {
      request = walletApprovalRequest(input);
    } catch {
      throw new AccountError(400, 'Pedido de wallet inválido.');
    }
    const handoff = await this.store.handoffByTicket(tokenHash(request.ticket));
    if (request.ecosystem !== handoff.ecosystem)
      throw new AccountError(401, 'Pedido de wallet inválido.');
    const serverTime = new Date();
    const remaining = handoff.expiresAt.getTime() - serverTime.getTime();
    if (remaining <= 0 || remaining > challengeSeconds * 1000)
      throw new AccountError(401, 'Pedido expirou.');
    return {
      request,
      expiresAt: handoff.expiresAt.toISOString(),
      serverTime: serverTime.toISOString(),
    };
  }
  private handoffTicket(input: unknown): string {
    const value = boundedText(input, 64);
    if (!/^[a-f0-9]{64}$/u.test(value))
      throw new AccountError(400, 'Pedido inválido.');
    return value;
  }
  async signHandoff(input: unknown, browserToken: string): Promise<void> {
    const data = object(input);
    keys(data, ['ticket', 'id', 'signature']);
    const hash = tokenHash(this.handoffTicket(data['ticket']));
    const challenge = await this.store.claimAttempt(
      uuid(data['id']),
      tokenHash(browserToken),
    );
    if (challenge.handoffHash !== hash)
      throw new AccountError(401, 'Pedido de retorno inválido.');
    verifyChallenge(challenge, data['signature'], this.origin);
    await this.store.acceptHandoffSignature(challenge, hash);
  }
  async handoffStatus(browserToken: string) {
    const state = await this.store.handoffStatus(tokenHash(browserToken));
    return state
      ? { ...state, expiresAt: state.expiresAt.toISOString() }
      : null;
  }
  async cancelHandoff(browserToken: string): Promise<void> {
    await this.store.cancelHandoff(tokenHash(browserToken));
  }
  async finishHandoff(
    input: unknown,
    browserToken: string,
    previousToken?: string,
  ) {
    const data = object(input);
    keys(data, ['address', 'ecosystem']);
    const network = validatedEcosystem(data['ecosystem']);
    const address = canonicalAddress(network, data['address']);
    const sessionToken = token();
    await this.store.finishHandoff({
      browserHash: tokenHash(browserToken),
      address,
      ecosystem: network,
      tokenHash: tokenHash(sessionToken),
      csrf: token(),
      expiresAt: new Date(Date.now() + sessionSeconds * 1000),
      ...(previousToken ? { previousTokenHash: tokenHash(previousToken) } : {}),
    });
    return { sessionToken, session: await this.session(sessionToken) };
  }

  async session(sessionToken: string): Promise<AccountSession> {
    return this.store.session(tokenHash(sessionToken));
  }

  async authorize(sessionToken: string, csrf: unknown): Promise<void> {
    const session = await this.session(sessionToken);
    if (
      typeof csrf !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(csrf) ||
      !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
    )
      throw new AccountError(403, 'Pedido não autorizado.');
  }

  async logout(sessionToken: string): Promise<void> {
    await this.store.logout(tokenHash(sessionToken));
  }

  async rename(sessionToken: string, input: unknown): Promise<AccountSession> {
    const data = object(input);
    keys(data, ['name']);
    await this.store.rename(tokenHash(sessionToken), displayName(data['name']));
    return this.session(sessionToken);
  }

  async profile(sessionToken: string): Promise<EncryptedProfile | null> {
    return this.store.readProfile(tokenHash(sessionToken));
  }

  async saveProfile(sessionToken: string, input: unknown): Promise<void> {
    await this.store.writeProfile(
      tokenHash(sessionToken),
      profileEnvelope(input),
    );
  }
}
