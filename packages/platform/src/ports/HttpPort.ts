/**
 * HttpPort — abstraction over content-API requests for the data layer.
 *
 * The data layer composes absolute target URLs (QF content API paths) and
 * asks the port for them. The adapter is responsible for *routing and
 * auth*: the web adapter routes every request through the app's
 * `/api/proxy` CORS proxy (which attaches the QF OAuth token server-side);
 * the native adapter points the same proxy at the deployed
 * `API_BASE_URL` (ADR-004). No client-side credential ever enters this
 * interface — by design, the secret never ships in the app.
 */
export interface HttpPort {
  /**
   * GET an absolute target URL and return the raw response (whatever the
   * status). Use for streaming or when the caller inspects the status.
   */
  get(targetUrl: string): Promise<Response>;

  /**
   * GET an absolute target URL and parse the body as JSON.
   * @throws {HttpError} when the response is not OK.
   */
  getJson<T>(targetUrl: string): Promise<T>;
}

/**
 * A non-OK response from an {@link HttpPort} request.
 */
export class HttpError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
  }
}
