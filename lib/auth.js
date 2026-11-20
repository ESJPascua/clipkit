// Shared helpers for the ClipForge Pro paywall (Cloudflare Pages Functions).
//
// Required environment variables (Cloudflare Pages → Settings → Variables and Secrets):
//   WHOP_CLIENT_ID      your Whop app id, e.g. app_xxxxxxxx
//   WHOP_API_KEY        a Whop API key for the ClipKit business (keep secret)
//   SESSION_SECRET      any long random string (keep secret)
// Optional:
//   (no client secret: the Whop app is set to Public OAuth mode)
//   WHOP_PRODUCT_ID     defaults to the ClipForge Pro product below

export const DEFAULT_PRODUCT_ID = 'prod_IzGB9dtut1EDC';
export const SESSION_COOKIE = 'ck_session';
export const PKCE_COOKIE = 'ck_pkce';
export const SESSION_HOURS = 24;

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function randomString(n = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}
export async function sha256b64url(str) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
// value = base64url(JSON) + "." + base64url(HMAC)
export async function sign(obj, secret) {
  const body = b64url(enc.encode(JSON.stringify(obj)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64url(sig);
}
export async function verify(value, secret) {
  if (!value || !secret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const obj = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (e) {
    return null;
  }
}

export function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`;
}

export function configError(env) {
  const missing = ['WHOP_CLIENT_ID', 'WHOP_API_KEY', 'SESSION_SECRET'].filter(k => !env[k]);
  return missing.length ? missing : null;
}

export function page(title, bodyHtml, status = 200, extraHeaders = {}) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<link rel="icon" href="/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter+Tight:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c0f;color:#eceef2;font:16px/1.5 "Inter Tight",system-ui,sans-serif;padding:20px;box-sizing:border-box}
.box{max-width:460px;width:100%;background:#13151a;border:1px solid #252932;border-radius:16px;padding:28px}
h1{font:400 34px/1 Anton,sans-serif;text-transform:uppercase;letter-spacing:.4px;margin:0 0 10px}h1 em{font-style:normal;color:#d7ff3d}
p{color:#9aa1ad;margin:0 0 18px}.btn{display:flex;align-items:center;justify-content:center;height:46px;border-radius:10px;font-weight:700;text-decoration:none;margin-top:10px}
.pri{background:#d7ff3d;color:#141700}.sec{border:1px solid #323743;color:#eceef2}small{display:block;color:#666d7a;margin-top:16px;font-size:13px}</style></head>
<body><div class="box">${bodyHtml}</div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } });
}

export async function checkAccess(env, userId) {
  const product = env.WHOP_PRODUCT_ID || DEFAULT_PRODUCT_ID;
  const r = await fetch(`https://api.whop.com/api/v1/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(product)}`, {
    headers: { Authorization: `Bearer ${env.WHOP_API_KEY}` },
  });
  if (!r.ok) throw new Error('Access check failed (' + r.status + ')');
  const j = await r.json();
  return !!j.has_access;
}
