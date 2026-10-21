# Setting up the Petal Planner website

About 20 minutes, done once, on a laptop or tablet (dashboards are fiddly on a
phone). Three parts:

1. Put the website online with a password (Cloudflare, ~5 min).
2. Connect Google Calendar (Google Cloud, ~10 min). This part is optional;
   everything else works without it.
3. Move your planner into it (~2 min).

Everything is free at this size.

---

## Part 1: The website (Cloudflare)

Log in at https://dash.cloudflare.com (the same account as the Life OS site).

**1. Make the database**
- Go to **Storage & Databases → D1 SQL Database → Create**.
- Name it `petal-planner` and click **Create**.

**2. Make the website from GitHub**
- Go to **Workers & Pages → Create → Pages → Connect to Git**.
- Pick the **FK-Life-OS** repository. If it isn't listed, click the option to
  add GitHub access for it.
- Fill in:
  - Project name: `petal-planner`. This becomes the address
    `https://petal-planner.pages.dev`. If the name is taken, pick another and
    use that address in the rest of these steps.
  - Production branch: `main`
  - Framework preset: `None`
  - Build command: leave empty
  - Build output directory: leave empty
  - **Root directory (advanced): `petal`**
- Click **Save and Deploy**.

**3. Connect the database to the website**
- Open the new `petal-planner` project → **Settings → Bindings → Add → D1 database**.
- Variable name: `DB` (capitals). Database: `petal-planner`. Save.

**4. Set your password**
- **Settings → Variables and Secrets → Add**.
- Type: **Secret**. Name: `PETAL_PASSWORD`. Value: the password you want. Save.

**5. Redeploy so the settings take effect**
- **Deployments** → the latest one → **⋯ → Retry deployment**.

Open `https://petal-planner.pages.dev`. You should see the Petal Planner sign-in
page. From now on, every change pushed to GitHub updates the site by itself.

---

## Part 2: Google Calendar (Google Cloud)

Log in at https://console.cloud.google.com with the Google account whose
calendar you use.

**1. Make a project**
- Click the project picker at the top → **New project** → name it
  `Petal Planner` → **Create**. Make sure it is selected.

**2. Turn on the Calendar API**
- Search the top bar for **Google Calendar API** → open it → **Enable**.

**3. Describe the app**
- Go to **APIs & Services → OAuth consent screen**. This may be called
  **Google Auth Platform**. Click **Get started**.
- App name: `Petal Planner`. Support email: your Gmail.
- Audience: **External**. Contact email: your Gmail. Agree and **Create**.
- Go to **Audience** → **Publish app** → **Confirm**.
  This matters: while an app is left "in testing", Google stops the calendar
  connection every 7 days.

**4. Make the login key**
- Go to **Clients → Create client**.
- Application type: **Web application**. Name: `Petal Planner website`.
- Under **Authorised redirect URIs** → **Add URI**:
  `https://petal-planner.pages.dev/api/calendar/callback`
- Click **Create**. Copy the **Client ID** and the **Client secret**.

**5. Give them to the website**
- Back in Cloudflare: `petal-planner` → **Settings → Variables and Secrets**.
  - Add `GOOGLE_CLIENT_ID` (type Text) = the Client ID.
  - Add `GOOGLE_CLIENT_SECRET` (type Secret) = the Client secret.
- **Deployments → ⋯ → Retry deployment**.

**6. Connect**
- Open the website → **Calendar** → **Connect Google Calendar**.
- Google will say the app **isn't verified**. That's expected, because it's your
  own private app rather than one for the public. Click **Advanced → Go to
  Petal Planner**, then **Continue**.
- Back on the website it says "Google Calendar connected". This is done once,
  and works on every device you sign in on.

---

## Part 3: Move your planner in

1. Open Petal Planner in **claude.ai** (the link you've been using) → menu →
   **Download backup**.
2. Open **`https://petal-planner.pages.dev`** on that same device → sign in →
   menu → **Restore from backup** → pick the file. Everything appears and goes
   up to the server.
3. On each other device, just open the address and sign in. Everything is
   already there.
4. To make it look like an app, open the website and add it to the home screen:
   - iPhone/iPad: Safari → Share → **Add to Home Screen**.
   - Android: Chrome → ⋮ → **Add to Home screen**.

After this, use the website rather than the claude.ai link. The two don't sync
with each other.

---

## Good to know

- **Changed the password?** Every device is signed out and asks for the new one.
- **Lost a phone?** Change `PETAL_PASSWORD` in Cloudflare and redeploy. That
  phone is signed out at once.
- **Offline?** The app still opens and saves. A pink pill in the corner says
  it's offline, and it catches up once you're connected again.
- **Disconnect Google Calendar:** Calendar tab → **Disconnect**.
