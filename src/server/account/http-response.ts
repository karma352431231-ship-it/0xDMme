import type { ServerResponse } from 'node:http';
/** The account API's existing JSON status/header/body representation. */
export function sendAccountJson(
  response: ServerResponse,
  status: number,
  data: unknown,
): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.writeHead(status).end(JSON.stringify(data));
}
