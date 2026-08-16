import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

function devProxy(): Plugin {
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
          Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream).pipe(res);
        } catch {
          res.statusCode = 502;
          res.end('upstream failed');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devProxy()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});