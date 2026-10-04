import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  fingerprint,
  linkCode,
  linkProof,
  verify,
} from '../../shared/devices/index.ts';
import type { LinkCode } from '../../shared/devices/index.ts';
import type { DeviceService } from '../devices/index.ts';
interface Invitation {
  source: AccountSession;
  id: string;
  codeHash: string;
  root: string;
  head: string;
  expiresAt: string;
  candidate: { code: LinkCode; signature: string; proof: string } | null;
}
export class EnrollmentLinks {
  private readonly devices: DeviceService;
  private readonly invitations = new Map<string, Invitation>();
  constructor(devices: DeviceService) {
    this.devices = devices;
  }
  private current(id: string): Invitation {
    for (const [key, value] of this.invitations)
      if (Date.parse(value.expiresAt) <= Date.now())
        this.invitations.delete(key);
    const invitation = this.invitations.get(id);
    if (!invitation)
      throw new AccountError(
        409,
        'Código expirado. Gere outro no aparelho conectado.',
      );
    return invitation;
  }
  async create(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['id', 'codeHash', 'root', 'head', 'expiresAt', 'signature']);
    const payload = {
      id: uuid(data['id']),
      codeHash: fingerprint(data['codeHash']),
      root: fingerprint(data['root']),
      head: fingerprint(data['head']),
      expiresAt: boundedText(data['expiresAt'], 32),
    };
    const remaining = Date.parse(payload.expiresAt) - Date.now();
    if (!(remaining > 0 && remaining <= 300_000))
      throw new AccountError(400, 'Prazo de vinculação inválido.');
    await this.devices.enrollmentSource(
      session,
      payload,
      boundedText(data['signature'], 256),
    );
    for (const [id, value] of this.invitations)
      if (
        Date.parse(value.expiresAt) <= Date.now() ||
        (value.source.accountId === session.accountId &&
          value.source.deviceId === session.deviceId)
      )
        this.invitations.delete(id);
    if (this.invitations.size >= 128)
      throw new AccountError(429, 'Muitos pedidos de vinculação. Aguarde.');
    if (this.invitations.has(payload.id))
      throw new AccountError(409, 'Código já usado.');
    this.invitations.set(payload.id, {
      ...payload,
      source: session,
      candidate: null,
    });
    return { expiresAt: payload.expiresAt };
  }
  async join(
    input: unknown,
    issue: (
      source: AccountSession,
      device: string,
    ) => Promise<{ sessionToken: string; session: AccountSession }>,
    cancel: (token: string) => Promise<void>,
  ) {
    const data = object(input);
    keys(data, ['id', 'codeHash', 'code', 'signature', 'proof']);
    const invitation = this.current(uuid(data['id']));
    if (
      invitation.candidate ||
      fingerprint(data['codeHash']) !== invitation.codeHash
    )
      throw new AccountError(409, 'Código já usado ou inválido.');
    await this.devices.assertEnrollmentSource(
      invitation.source,
      invitation.head,
    );
    const code = linkCode(data['code']),
      signature = boundedText(data['signature'], 256),
      proof = fingerprint(data['proof']);
    if (
      code.accountId !== invitation.source.accountId ||
      code.expiresAt !== invitation.expiresAt
    )
      throw new AccountError(400, 'Pedido pertence a outra conta ou prazo.');
    await verify(code.device.signing, signature, linkProof(code));
    // Reserve before issuing a session so concurrent uses cannot create two receivers.
    if (invitation.candidate || this.current(invitation.id) !== invitation)
      throw new AccountError(409, 'Código já usado ou inválido.');
    invitation.candidate = { code, signature, proof };
    let issued: string | null = null;
    try {
      const result = await issue(invitation.source, code.device.id);
      issued = result.sessionToken;
      await this.devices.start(result.session, { code, signature });
      return result;
    } catch (error: unknown) {
      this.invitations.delete(invitation.id);
      if (issued) await cancel(issued);
      throw error;
    }
  }
  async pending(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['id']);
    const invitation = this.current(uuid(data['id']));
    if (
      invitation.source.accountId !== session.accountId ||
      invitation.source.deviceId !== session.deviceId ||
      invitation.source.csrf !== session.csrf
    )
      throw new AccountError(403, 'Código pertence a outra sessão.');
    await this.devices.assertEnrollmentSource(session, invitation.head);
    return invitation.candidate;
  }
  close(): void {
    this.invitations.clear();
  }
}
