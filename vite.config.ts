import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ALLOWED_HOSTS = [
  'apis.quran.foundation',
  'apis-prelive.quran.foundation',
  'api.quran.com',
  'download.quranicaudio.com',
  'audio.qurancdn.com',
  'cdn.qurancdn.com',
  'verses.quran.com',
];
const ALLOWED_SUFFIXES = ['.quranicaudio.com', '.qurancdn.com', '.mp3quran.net'];

function isAllowed(target: URL): boolean {
  if (target.protocol !== 'https:') return false;
  const host = target.hostname;
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

interface QfTokenCache {
  token: string;
  expiresAt: number;
}

let qfTokenCache: QfTokenCache | null = null;

async function getDevQfToken(env: Record<string, string>): Promise<string | null> {
  const clientId = env.QF_CLIENT_ID;
  const clientSecret = env.QF_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (qfTokenCache && Date.now() < qfTokenCache.expiresAt) return qfTokenCache.token;
  const endpoint = env.QF_TOKEN_ENDPOINT ?? 'https://oauth2.quran.foundation/oauth2/token';
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        'User-Agent': 'quran-video-generator/0.1',
      },
      body: 'grant_type=client_credentials&scope=content',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const ttl = Number(data.expires_in ?? 3600);
    qfTokenCache = { token: data.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
    return data.access_token;
  } catch {
    return null;
  }
}

function isQfHost(host: string): boolean {
  return host === 'apis.quran.foundation' || host === 'apis-prelive.quran.foundation';
}

function devProxy(env: Record<string, string>): Plugin {
  return {
    name: 'dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const urlParam = new URL(req.url ?? '', 'http://localhost').searchParams.get('url');
        if (!urlParam) {
          res.statusCode = 400;
          res.end('missing url');
          return;
        }
        let target: URL;
        try {
          target = new URL(urlParam);
        } catch {
          res.statusCode = 400;
          res.end('invalid url');
          return;
        }
        if (!isAllowed(target)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        try {
          const upstreamHeaders: Record<string, string> = {};
          if (typeof req.headers.range === 'string') {
            upstreamHeaders.Range = req.headers.range;
          }
          if (isQfHost(target.hostname)) {
            const token = await getDevQfToken(env);
            if (token) {
              upstreamHeaders['x-auth-token'] = token;
              upstreamHeaders['x-client-id'] = env.QF_CLIENT_ID ?? '';
            }
          }
          const upstream = await fetch(target.toString(), { headers: upstreamHeaders });
          const body = upstream.body;
          if (!body) {
            res.statusCode = upstream.status;
            res.end(Buffer.from(await upstream.arrayBuffer()));
            return;
          }
          res.statusCode = upstream.status;
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ?? 'application/octet-stream',
          );
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Cache-Control', upstream.headers.get('cache-control') ?? 'public, max-age=300');
          const contentRange = upstream.headers.get('content-range');
          if (contentRange) res.setHeader('Content-Range', contentRange);
          const acceptRanges = upstream.headers.get('accept-ranges');
          if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
          const contentLength = upstream.headers.get('content-length');
          if (contentLength) res.setHeader('Content-Length', contentLength);
          const readable = Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream);
          readable.on('error', () => { if (!res.writableEnded) res.destroy(); });
          res.on('close', () => { readable.destroy(); });
          readable.pipe(res);
        } catch {
          res.statusCode = 502;
          res.end('upstream failed');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), devProxy(env)],
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  };
});