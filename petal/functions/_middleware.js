// Password gate for the whole Petal Planner site.
//
// Cloudflare Pages runs this in front of every request: the app page, its
// files and every /api call. Nothing is served until the browser holds a valid
// session cookie, which it gets by typing the password on the sign-in page.
//
// A sign-in page and a cookie, rather than the browser's own password pop-up,
// because the pop-up does not work reliably in an app saved to an iPhone home
// screen. One sign-in keeps that device signed in for a year.
//
// The password is NOT stored here. It comes from an environment variable on
// the Cloudflare Pages project (Settings -> Variables and Secrets):
//
//   PETAL_PASSWORD  the password to type (required)
//
// Unlike a site with nothing private on it, this one holds the planner data on
// the server, so without PETAL_PASSWORD the site stays locked rather than open.
// Changing the password signs every device out, because sessions are signed
// with it.

import { ensureSchema, kvGet, kvSet, kvDelete } from "./_shared/db.js";

const COOKIE = "petal_session";
const SESSION_DAYS = 365;
// After this many wrong passwords from one address within the window, further
// attempts are refused until the window has passed.
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

// Files the browser or the phone may fetch without a cookie, such as the home
// screen icon. Nothing personal is in any of them.
const PUBLIC_PATHS = new Set(["/manifest.webmanifest", "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/favicon.ico"]);

// Every reply from this site carries this header, so the app can tell it is
// running on the website (with sync) rather than inside claude.ai.
const SITE_HEADER = "X-Petal-Planner";

export async function onRequest(context) {
  const response = await gate(context);
  const tagged = new Response(response.body, response);
  tagged.headers.set(SITE_HEADER, "1");
  return tagged;
}

async function gate(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (PUBLIC_PATHS.has(path)) return next();
  // the server code sits in the same folder as the site's files; never hand it out as a file
  if (path.startsWith("/functions/") || path === "/functions") return new Response("Not found", { status: 404 });

  const password = env.PETAL_PASSWORD;
  if (!password) {
    return page(setupPage(), 503);
  }

  if (path === "/login") {
    if (request.method === "POST") return handleLogin(request, env, password);
    return page(loginPage(""));
  }
  if (path === "/logout") {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login", "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, "Cache-Control": "no-store" },
    });
  }

  if (await hasValidSession(request, password)) return next();

  if (path.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Signed out", signedOut: true }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
}

async function handleLogin(request, env, password) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const db = env.DB;
  const failureKey = "login-failures:" + ip;
  let failures = null;
  if (db) {
    await ensureSchema(db);
    failures = await kvGet(db, failureKey);
    if (failures && Date.now() - failures.first > FAILURE_WINDOW_MS) failures = null;
    if (failures && failures.count >= MAX_FAILURES) {
      return page(loginPage("Too many wrong attempts. Please wait 15 minutes and try again."), 429);
    }
  }

  let typed = "";
  try {
    const form = await request.formData();
    typed = String(form.get("password") || "");
  } catch (e) {}

  if (!(await equals(typed, password))) {
    if (db) {
      const next = failures ? { first: failures.first, count: failures.count + 1 } : { first: Date.now(), count: 1 };
      await kvSet(db, failureKey, next);
    }
    // a short pause makes guessing slower without bothering someone who mistyped once
    await new Promise((r) => setTimeout(r, 800));
    return page(loginPage("That password isn't right. Please try again."), 401);
  }

  if (db && failures) await kvDelete(db, failureKey);
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const token = `${expires}.${await sign(String(expires), password)}`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
      "Cache-Control": "no-store",
    },
  });
}

async function hasValidSession(request, password) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!match) return false;
  const [expires, signature] = match.slice(COOKIE.length + 1).split(".");
  if (!expires || !signature || !(Number(expires) > Date.now())) return false;
  return equals(signature, await sign(expires, password));
}

async function sign(message, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("petal-session:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Constant-time comparison of two strings, done on their SHA-256 hashes so the
// lengths match too: a wrong guess cannot be narrowed down by timing.
async function equals(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let difference = 0;
  for (let i = 0; i < xa.length; i++) difference |= xa[i] ^ ya[i];
  return difference === 0;
}

function page(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" },
  });
}

function shell(inner) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Petal Planner</title>
<meta name="theme-color" content="#c85f8e">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Petal Planner">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#3f2333;
    background:linear-gradient(160deg,#fff6f9 0%,#ffeef5 100%)}
  .card{width:100%;max-width:360px;background:#fff;border:1px solid #f0d3e0;border-radius:22px;padding:30px 26px;
    box-shadow:0 8px 30px rgba(200,95,142,.15);text-align:center}
  h1{font-family:Georgia,serif;font-style:italic;font-weight:400;color:#c85f8e;font-size:1.6rem;margin:14px 0 4px}
  p{color:#8a6076;font-size:.9rem;line-height:1.45;margin:0 0 20px}
  input{width:100%;font-size:1rem;padding:13px 16px;border:1px solid #f0d3e0;border-radius:14px;background:#fffdfe;color:#3f2333}
  input:focus{outline:none;border-color:#c85f8e;box-shadow:0 0 0 3px #fbe2ec}
  button{width:100%;margin-top:12px;padding:13px;font-size:1rem;font-weight:600;border:none;border-radius:14px;
    background:#c85f8e;color:#fff;cursor:pointer}
  .err{color:#c8517f;font-weight:600;font-size:.86rem;margin:0 0 14px}
</style></head><body><div class="card">
<svg width="56" height="56" viewBox="0 0 60 60" aria-hidden="true"><g fill="#c85f8e"><ellipse cx="30" cy="14" rx="9" ry="13"/><ellipse cx="30" cy="46" rx="9" ry="13"/><ellipse cx="14" cy="30" rx="13" ry="9"/><ellipse cx="46" cy="30" rx="13" ry="9"/></g><circle cx="30" cy="30" r="8" fill="#f4b6cf"/></svg>
${inner}
</div></body></html>`;
}

function loginPage(error) {
  return shell(`<h1>Petal Planner</h1>
<p>Private. Type your password to open it. This device stays signed in for a year.</p>
${error ? `<div class="err">${error}</div>` : ""}
<form method="post" action="/login">
  <input type="password" name="password" autocomplete="current-password" placeholder="Password" required autofocus>
  <button type="submit">Open</button>
</form>`);
}

function setupPage() {
  return shell(`<h1>Petal Planner</h1>
<p>This site is locked because no password has been set yet. In Cloudflare, add a secret named <strong>PETAL_PASSWORD</strong> to this Pages project, then deploy again.</p>`);
}
