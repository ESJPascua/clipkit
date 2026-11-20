// GET /logout → clear the ClipForge session.
import { cookie, SESSION_COOKIE } from '../lib/auth.js';

export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': cookie(SESSION_COOKIE, '', 0), 'Cache-Control': 'no-store' },
  });
}
