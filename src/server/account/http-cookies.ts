import type { IncomingMessage } from 'node:http';
/** Preserve historical cookie identities and their exact transport policy. */
export class AccountHttpCookies {
  private readonly secure: boolean;
  constructor(origin: string) {
    this.secure = new URL(origin).protocol === 'https:';
  }
  private name(kind: 'session' | 'challenge' | 'return'): string {
    return (this.secure ? '__Host-' : '') + 'hash-talk-' + kind;
  }
  read(
    request: IncomingMessage,
    kind: 'session' | 'challenge' | 'return',
  ): string {
    const name = this.name(kind);
    const matches = (request.headers.cookie ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item.startsWith(`${name}=`));
    if (matches.length !== 1) return '';
    const value = matches[0]?.slice(name.length + 1) ?? '';
    return /^[a-f0-9]{64}$/u.test(value) ? value : '';
  }
  write(
    kind: 'session' | 'challenge' | 'return',
    value: string,
    seconds: number,
  ): string {
    return (
      this.name(kind) +
      '=' +
      value +
      '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
      seconds +
      (this.secure ? '; Secure' : '')
    );
  }
}
