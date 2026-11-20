// Guards everything under /forge/ (the ClipForge Pro app).
// No valid session → sent to /login. Sessions last 24 hours, then Whop is checked again,
// so a cancelled membership stops working within a day.
import { verify, getCookie, configError, page, SESSION_COOKIE } from '../../lib/auth.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const missing = configError(env);
  if (missing) return page('Setup needed', `<h1>Setup <em>needed</em></h1><p>The site owner still needs to add: ${missing.join(', ')}.</p>`, 500);

  const session = await verify(getCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
  if (!session) {
    const url = new URL(request.url);
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('text/html') || url.pathname === '/forge' || url.pathname === '/forge/') {
      return new Response(null, { status: 302, headers: { Location: '/login?next=' + encodeURIComponent(url.pathname), 'Cache-Control': 'no-store' } });
    }
    return new Response('Sign in required', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
}
