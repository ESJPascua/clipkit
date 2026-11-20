// GET /callback → Whop sends the user back here after signing in.
// Exchanges the code, finds out who they are, checks they have ClipForge Pro, then sets a session cookie.
import { verify, sign, getCookie, cookie, page, checkAccess, configError, PKCE_COOKIE, SESSION_COOKIE, SESSION_HOURS } from '../lib/auth.js';

const CHECKOUT = 'https://whop.com/checkout/plan_Ck8NEnFvXmkP6';

export async function onRequestGet({ request, env }) {
  const missing = configError(env);
  if (missing) return page('Setup needed', `<h1>Setup <em>needed</em></h1><p>The site owner still needs to add: ${missing.join(', ')}.</p>`, 500);

  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) return page('Sign-in cancelled', `<h1>Sign-in <em>cancelled</em></h1><p>${escapeHtml(url.searchParams.get('error_description') || err)}</p><a class="btn pri" href="/login">Try again</a><a class="btn sec" href="/">Back to ClipKit</a>`, 400);

  const pkce = await verify(getCookie(request, PKCE_COOKIE), env.SESSION_SECRET);
  if (!pkce || pkce.s !== url.searchParams.get('state')) {
    return page('Sign-in expired', `<h1>Let's try <em>again</em></h1><p>Your sign-in took too long or was opened in another browser.</p><a class="btn pri" href="/login">Sign in with Whop</a>`, 400);
  }

  try {
    const body = {
      grant_type: 'authorization_code',
      code: url.searchParams.get('code'),
      redirect_uri: url.origin + '/callback',
      client_id: env.WHOP_CLIENT_ID,
      code_verifier: pkce.v,
    };
    // Public OAuth client (PKCE): no client secret is sent.
    const tr = await fetch('https://api.whop.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!tr.ok) throw new Error('token exchange ' + tr.status + ' ' + (await tr.text()).slice(0, 200));
    const tokens = await tr.json();

    const ur = await fetch('https://api.whop.com/oauth/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
    if (!ur.ok) throw new Error('userinfo ' + ur.status);
    const user = await ur.json();
    const userId = user.sub;

    const has = await checkAccess(env, userId);
    const clear = cookie(PKCE_COOKIE, '', 0);
    if (!has) {
      return page('Get ClipForge Pro', `<h1>Almost <em>there</em></h1><p>You're signed in as <b style="color:#eceef2">${escapeHtml(user.preferred_username || user.name || 'your Whop account')}</b>, but this account doesn't have ClipForge Pro yet.</p>
<a class="btn pri" href="${CHECKOUT}">Get Pro: $3/month</a><a class="btn sec" href="/login">I just paid, check again</a>
<small>Bought it with a different Whop account? Sign out of Whop, then sign in with that one.</small>`, 403, { 'Set-Cookie': clear });
    }

    const session = await sign({ u: userId, name: user.preferred_username || user.name || '', exp: Date.now() + SESSION_HOURS * 3600 * 1000 }, env.SESSION_SECRET);
    const headers = new Headers({ Location: pkce.n || '/forge/', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_HOURS * 3600));
    headers.append('Set-Cookie', clear);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return page('Sign-in failed', `<h1>Something <em>broke</em></h1><p>Sign-in didn't go through. Try again in a minute.</p><a class="btn pri" href="/login">Try again</a><small>${escapeHtml(String(e.message || e))}</small>`, 502);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
