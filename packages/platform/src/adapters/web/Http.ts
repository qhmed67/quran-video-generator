import { HttpError, type HttpPort } from '../../ports/HttpPort';

/**
 * Web HTTP port: routes every request through the app's `/api/proxy`
 * CORS proxy, exactly as `src/data/sources.ts` does today. The proxy
 * attaches the QF OAuth token server-side, so no credential ever enters
 * the app. A different `proxyBase` lets a deployment point at the
 * deployed proxy under `API_BASE_URL`.
 */
export class BrowserHttpPort implements HttpPort {
  constructor(private readonly proxyBase: string = '/api/proxy') {}

  async get(targetUrl: string): Promise<Response> {
    return fetch(`${this.proxyBase}?url=${encodeURIComponent(targetUrl)}`);
  }

  async getJson<T>(targetUrl: string): Promise<T> {
    const res = await this.get(targetUrl);
    if (!res.ok) throw new HttpError(targetUrl, res.status);
    return res.json() as Promise<T>;
  }
}
