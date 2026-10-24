import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountService } from './service.ts';
import { AccountHttpCookies } from './http-cookies.ts';
import { sendAccountJson } from './http-response.ts';
import { EnrollmentLinks } from '../device-enrollment/index.ts';
import type { DeviceService } from '../devices/index.ts';
import { sessionSeconds } from './service.ts';
interface EnrollmentHttpOptions {
  service: Pick<AccountService, 'session' | 'beginLinked' | 'logout'>;
  devices: DeviceService | undefined;
}
/** Owns linking invitations, receiver issuance and device-route adaptation. */
export class AccountEnrollmentHttp {
  private readonly options: EnrollmentHttpOptions;
  private readonly cookies: AccountHttpCookies;
  private readonly enrollments: EnrollmentLinks | null;
  constructor(options: EnrollmentHttpOptions, cookies: AccountHttpCookies) {
    this.options = options;
    this.cookies = cookies;
    this.enrollments = options.devices
      ? new EnrollmentLinks(options.devices)
      : null;
  }
  async join(
    request: IncomingMessage,
    response: ServerResponse,
    input: unknown,
  ): Promise<boolean> {
    if (request.url !== '/api/account/enrollment-join' || !this.enrollments)
      return false;
    const login = await this.enrollments.join(
      input,
      (source, device) =>
        this.options.service.beginLinked(
          source,
          device,
          this.cookies.read(request, 'session'),
        ),
      (token) => this.options.service.logout(token),
    );
    response.setHeader(
      'Set-Cookie',
      this.cookies.write('session', login.sessionToken, sessionSeconds),
    );
    sendAccountJson(response, 200, login.session);
    return true;
  }
  async post(
    request: IncomingMessage,
    response: ServerResponse,
    sessionToken: string,
    input: unknown,
  ): Promise<boolean> {
    if (
      !request.url?.startsWith('/api/account/devices/') ||
      !this.options.devices
    )
      return false;
    const session = await this.options.service.session(sessionToken);
    if (
      request.url === '/api/account/devices/enrollment-create' &&
      this.enrollments
    ) {
      sendAccountJson(
        response,
        200,
        await this.enrollments.create(session, input),
      );
      return true;
    }
    if (
      request.url === '/api/account/devices/enrollment-pending' &&
      this.enrollments
    ) {
      sendAccountJson(
        response,
        200,
        await this.enrollments.pending(session, input),
      );
      return true;
    }
    sendAccountJson(
      response,
      200,
      await this.options.devices.operate(
        request.url.slice('/api/account/devices/'.length),
        session,
        input,
      ),
    );
    return true;
  }
  close(): void {
    this.enrollments?.close();
  }
}
