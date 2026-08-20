// Password gate for the whole site.
//
// Cloudflare Pages runs this in front of every request, including the static
// index.html, so nothing is served until the browser sends the right password.
//
// The password is NOT stored here. It comes from environment variables set in
// the Cloudflare dashboard: Settings -> Variables and Secrets.
//
//   LIFEOS_USER      the username to type   (optional, defaults to "fk")
//   LIFEOS_PASSWORD  the password to type   (required for the gate to switch on)
//
// If LIFEOS_PASSWORD is not set, the gate stays open rather than locking
// everyone out of a site that has no password to give.

export async function onRequest(context) {
  const { request, env, next } = context;

  const expectedPassword = env.LIFEOS_PASSWORD;
  if (!expectedPassword) return next();

  const expectedUser = env.LIFEOS_USER || "fk";
  const header = request.headers.get("Authorization") || "";

  if (header.startsWith("Basic ")) {
    const credentials = decodeCredentials(header.slice(6));
    if (credentials) {
      const userOk = equals(credentials.user, expectedUser);
      const passOk = equals(credentials.password, expectedPassword);
      // Both are compared before returning so a wrong username and a wrong
      // password take the same amount of time to reject.
      if (userOk && passOk) return next();
    }
  }

  return new Response("This site is private. A username and password are required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Life OS", charset="UTF-8"',
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function decodeCredentials(encoded) {
  let decoded;
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    decoded = new TextDecoder().decode(bytes);
  } catch (e) {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

// Constant-time comparison, so a wrong guess cannot be narrowed down by
// timing how long the rejection took.
function equals(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
