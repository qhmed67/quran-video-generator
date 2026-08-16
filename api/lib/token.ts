const TOKEN_ENDPOINT =
  process.env.QF_TOKEN_ENDPOINT ?? 'https://apis.quran.foundation/oauth/token';

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
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'content',
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error('QF token exchange failed');
  }
  const ttlSeconds = Number(data.expires_in ?? 3600);
  cached = {
    access_token: data.access_token,
    expires_at: Date.now() + (ttlSeconds - 60) * 1000,
  };
  return data.access_token;
}