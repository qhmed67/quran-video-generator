const TOKEN_ENDPOINT =
  process.env.QF_TOKEN_ENDPOINT ?? 'https://oauth2.quran.foundation/oauth2/token';

let cached: { access_token: string; expires_at: number } | null = null;

export async function getQfToken(): Promise<string> {
  if (cached && Date.now() < cached.expires_at) {
    return cached.access_token;
  }
  const clientId = process.env.QF_CLIENT_ID;
  const clientSecret = process.env.QF_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('QF_CLIENT_ID / QF_CLIENT_SECRET not configured');
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'content',
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
      'User-Agent': 'quran-video-generator/0.1',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`QF token exchange failed (${res.status})`);
  }
  const ttlSeconds = Number(data.expires_in ?? 3600);
  cached = {
    access_token: data.access_token,
    expires_at: Date.now() + (ttlSeconds - 60) * 1000,
  };
  return data.access_token;
}