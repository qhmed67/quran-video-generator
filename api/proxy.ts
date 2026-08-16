import { getQfToken } from './lib/token';

const ALLOWED_HOSTS = [
  'apis.quran.foundation',
  'apis-prelive.quran.foundation',
  'api.quran.com',
  'mp3quran.net',
];
const ALLOWED_SUFFIXES = ['.mp3quran.net'];

function isAllowed(target: URL): boolean {
  if (target.protocol !== 'https:') return false;
  const host = target.hostname;
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

export default async function handler(req: Request): Promise<Response> {
  const urlParam = new URL(req.url).searchParams.get('url');
  if (!urlParam) {
    return new Response('missing url', { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return new Response('invalid url', { status: 400 });
  }
  if (!isAllowed(target)) {
    return new Response('forbidden', { status: 403 });
  }

  const headers: Record<string, string> = {};
  if (
    target.hostname === 'apis.quran.foundation' ||
    target.hostname === 'apis-prelive.quran.foundation'
  ) {
    const clientId = process.env.QF_CLIENT_ID;
    if (clientId) headers['x-client-id'] = clientId;
    try {
      headers['x-auth-token'] = await getQfToken();
    } catch {
      void 0;
    }
  }

  const upstream = await fetch(target.toString(), { headers });
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': upstream.headers.get('cache-control') ?? 'public, max-age=300',
    },
  });
}