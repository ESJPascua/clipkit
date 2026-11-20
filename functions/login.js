// GET /login → send the user to "Sign in with Whop" (OAuth 2.1 + PKCE).
import { randomString, sha256b64url, sign, cookie, configError, page, PKCE_COOKIE } from '../lib/auth.js';

export async function onRequestGet({ request, env }) {
  const missing = configError(env);
  if (missing) return page('Setup needed', `<h1>Setup <em>needed</em></h1><p>The site owner still needs to add: ${missing.join(', ')}.</p>`, 500);

  const url = new URL(request.url);
  const next = (url.searchParams.get('next') || '/forge/').startsWith('/') ? (url.searchParams.get('next') || '/forge/') : '/forge/';
  const verifier = randomString(32);
  const state = randomString(16);
  const nonce = randomString(16);
  const redirectUri = url.origin + '/callback';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.WHOP_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: await sha256b64url(verifier),
    code_challenge_method: 'S256',
  });

  const pkce = await sign({ v: verifier, s: state, n: next, exp: Date.now() + 10 * 60 * 1000 }, env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://api.whop.com/oauth/authorize?' + params.toString(),
      'Set-Cookie': cookie(PKCE_COOKIE, pkce, 600),
      'Cache-Control': 'no-store',
    },
  });
}
