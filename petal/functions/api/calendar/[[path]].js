// Google Calendar connection for Petal Planner.
//
// GET  /api/calendar/status      {configured, connected, email}
// GET  /api/calendar/connect     sends the browser to Google to allow access
// GET  /api/calendar/callback    where Google sends it back; stores the access
// GET  /api/calendar/events      ?timeMin=&timeMax= (ISO) -> {events: [...]}
// POST /api/calendar/events      {summary, start, end, timeZone} or
//                                {summary, date} for an all-day event
// POST /api/calendar/disconnect  forgets the connection and revokes it at Google
//
// Google gives a long-lived "refresh token" once, when access is allowed; it is
// kept in the database and used to get short-lived access tokens as needed, so
// the calendar keeps working on every device without connecting again.
//
// Needs two environment variables on the Pages project, from an OAuth client
// made in Google Cloud Console (see README):
//
//   GOOGLE_CLIENT_ID      ends in .apps.googleusercontent.com
//   GOOGLE_CLIENT_SECRET  kept as a secret
//
// GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL and GOOGLE_API_URL can point at a stand-in
// server for local testing; they default to Google's real addresses.

import { ensureSchema, kvGet, kvSet, kvDelete, json, missingDatabase } from "../../_shared/db.js";

const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
const STATE_COOKIE = "petal_oauth_state";
const TOKEN_KEY = "google";

export async function onRequest(context) {
  const { request, env, params } = context;
  const db = env.DB;
  if (!db) return missingDatabase();
  await ensureSchema(db);

  const action = (params.path || []).join("/");
  const method = request.method;
  const urls = endpoints(env);
  const configured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  if (action === "status" && method === "GET") {
    const saved = configured ? await kvGet(db, TOKEN_KEY) : null;
    return json({ configured, connected: !!(saved && saved.refresh_token), email: saved ? saved.email || "" : "" });
  }
  if (!configured) return json({ error: "Google Calendar has not been set up for this site yet." }, 503);

  if (action === "connect" && method === "GET") {
    const state = randomHex(24);
    const auth = new URL(urls.auth);
    auth.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(request),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: auth.toString(),
        "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/api/calendar; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (action === "callback" && method === "GET") {
    const url = new URL(request.url);
    const back = (result) =>
      new Response(null, {
        status: 302,
        headers: {
          Location: "/?calendar=" + result + "#calendar",
          "Set-Cookie": `${STATE_COOKIE}=; Path=/api/calendar; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
          "Cache-Control": "no-store",
        },
      });
    const expected = readCookie(request, STATE_COOKIE);
    if (url.searchParams.get("error")) return back("cancelled");
    if (!expected || url.searchParams.get("state") !== expected) return back("failed");
    const res = await fetch(urls.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: url.searchParams.get("code") || "",
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(request),
        grant_type: "authorization_code",
      }),
    });
    const token = await res.json().catch(() => ({}));
    if (!res.ok || !token.access_token) return back("failed");
    const previous = await kvGet(db, TOKEN_KEY);
    await kvSet(db, TOKEN_KEY, {
      // Google only sends a refresh token the first time; keep the old one if this time had none
      refresh_token: token.refresh_token || (previous && previous.refresh_token) || "",
      access_token: token.access_token,
      expires_at: Date.now() + (Number(token.expires_in) || 3600) * 1000,
      email: emailFromIdToken(token.id_token) || (previous && previous.email) || "",
    });
    return back("connected");
  }

  if (action === "disconnect" && method === "POST") {
    const saved = await kvGet(db, TOKEN_KEY);
    await kvDelete(db, TOKEN_KEY);
    if (saved && saved.refresh_token && urls.revoke) {
      await fetch(urls.revoke + "?token=" + encodeURIComponent(saved.refresh_token), { method: "POST" }).catch(() => {});
    }
    return json({ ok: true });
  }

  if (action === "events") {
    const access = await accessToken(db, env, urls);
    if (!access) return json({ error: "Google Calendar needs connecting again.", needsReconnect: true }, 401);

    if (method === "GET") {
      const url = new URL(request.url);
      const timeMin = url.searchParams.get("timeMin");
      const timeMax = url.searchParams.get("timeMax");
      if (!validIso(timeMin) || !validIso(timeMax)) return json({ error: "timeMin and timeMax are required" }, 400);
      const events = [];
      let pageToken = "";
      for (let page = 0; page < 5; page++) {
        const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
        if (pageToken) q.set("pageToken", pageToken);
        const res = await fetch(`${urls.api}/calendars/primary/events?${q}`, { headers: { Authorization: "Bearer " + access } });
        if (res.status === 401) return json({ error: "Google Calendar needs connecting again.", needsReconnect: true }, 401);
        if (!res.ok) return json({ error: "Google Calendar didn't answer. Try again in a moment." }, 502);
        const body = await res.json();
        (body.items || []).forEach((ev) => {
          if (ev.status === "cancelled") return;
          events.push({ id: ev.id, summary: ev.summary || "", start: ev.start || {}, end: ev.end || {}, htmlLink: ev.htmlLink || "" });
        });
        pageToken = body.nextPageToken || "";
        if (!pageToken) break;
      }
      return json({ events });
    }

    if (method === "POST") {
      const input = await request.json().catch(() => null);
      if (!input || typeof input.summary !== "string" || !input.summary.trim()) return json({ error: "Give the event a title" }, 400);
      let event;
      if (typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        const next = new Date(input.date + "T00:00:00Z");
        next.setUTCDate(next.getUTCDate() + 1);
        event = { summary: input.summary.trim(), start: { date: input.date }, end: { date: next.toISOString().slice(0, 10) } };
      } else {
        const localTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
        if (!localTime.test(input.start || "") || !localTime.test(input.end || "")) return json({ error: "Start and end times are required" }, 400);
        const timeZone = typeof input.timeZone === "string" && input.timeZone ? input.timeZone : "Europe/London";
        event = { summary: input.summary.trim(), start: { dateTime: input.start, timeZone }, end: { dateTime: input.end, timeZone } };
      }
      const res = await fetch(`${urls.api}/calendars/primary/events`, {
        method: "POST",
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (res.status === 401) return json({ error: "Google Calendar needs connecting again.", needsReconnect: true }, 401);
      if (!res.ok) return json({ error: "Google Calendar didn't accept that event." }, 502);
      const ev = await res.json();
      return json({ event: { id: ev.id, summary: ev.summary || "", start: ev.start || {}, end: ev.end || {}, htmlLink: ev.htmlLink || "" } });
    }
  }

  return json({ error: "Not found" }, 404);
}

function endpoints(env) {
  return {
    auth: env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
    token: env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
    api: env.GOOGLE_API_URL || "https://www.googleapis.com/calendar/v3",
    revoke: env.GOOGLE_TOKEN_URL ? "" : "https://oauth2.googleapis.com/revoke",
  };
}

// A current access token, refreshed with the stored refresh token when it is
// about to run out. Returns null when there is no working connection.
async function accessToken(db, env, urls) {
  const saved = await kvGet(db, TOKEN_KEY);
  if (!saved || !saved.refresh_token) return null;
  if (saved.access_token && saved.expires_at - 60000 > Date.now()) return saved.access_token;
  const res = await fetch(urls.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const token = await res.json().catch(() => ({}));
  if (!res.ok || !token.access_token) {
    // access was withdrawn in the Google account, or the token expired: connect again
    if (token.error === "invalid_grant") await kvDelete(db, TOKEN_KEY);
    return null;
  }
  await kvSet(db, TOKEN_KEY, { ...saved, access_token: token.access_token, expires_at: Date.now() + (Number(token.expires_in) || 3600) * 1000 });
  return token.access_token;
}

function redirectUri(request) {
  return new URL("/api/calendar/callback", request.url).toString();
}

function readCookie(request, name) {
  const found = (request.headers.get("Cookie") || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return found ? found.slice(name.length + 1) : "";
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validIso(s) {
  return typeof s === "string" && !isNaN(Date.parse(s));
}

// The id_token comes straight from Google's token endpoint over HTTPS, so its
// payload can be read without checking the signature. Only the email is used,
// to show which account is connected.
function emailFromIdToken(idToken) {
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).email || "";
  } catch (e) {
    return "";
  }
}
