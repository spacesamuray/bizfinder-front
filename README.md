# Bizfinder web service (front end)

Bizfinder as a website people sign in to, instead of an app on your own computer. This
folder is the whole front end: plain HTML, CSS and JavaScript, with no build step.

**It's a preview for now.** There's no backend yet: signing in, call notes and searches all
happen in the visitor's browser, with sample searches of made-up businesses.

## What's here

| Page | |
|---|---|
| `index.html` | The front page: what Bizfinder does, a clickable demo, **Sign in** and **Request access** in the header |
| `signin.html` | Sign in. Bizfinder is invite only, so there's no public sign-up |
| `request-access.html` | Ask for an invite |
| `forgot-password.html` | Ask for a password reset link |
| `accept-invite.html` | Where an invite link leads: `accept-invite.html?email=…&token=…`. The person picks a name and password |
| `app/` | The Bizfinder app itself. People who aren't signed in are sent to Sign in first |

- `auth.js`: signing in and out, invites, password resets and access requests. **All the
  backend work goes here**: each function says what it needs to do.
- `forms.js`: the forms on the sign-in pages. `main.js`: the front page's animations and demo.
- `styles.css`: the look of every page except the app, in the logo's colours.
- `app/`: a copy of the real app (`bizfinder/static/`), plus `service.js` (the sign-in
  check and the account panel), `service.css`, and `demo-api.js` with `demo/`, which stand
  in for the server until there is one.
- `tools/sync_app.py`: copies the app from `bizfinder/static/` into `app/` again. **Run it
  after changing the app**, so the web version gets the change too:
  `python3 site/tools/sync_app.py`
- `tools/make_demo_data.py`: makes the sample searches in `app/demo/` with Bizfinder's own
  spreadsheet code. Every business in them is made up, phone numbers are masked, and
  websites and emails use `.example` addresses, which can't belong to anyone.

## Hosting it

Upload this folder to any static host (Cloudflare Pages, Netlify, GitHub Pages, ...). All
links inside are relative, so it works at any address, in a subfolder too.

**Before you share it with people:**
1. **Request access goes nowhere yet.** Put an address that collects forms in
   `REQUEST_ACCESS_URL` at the top of `auth.js` (a Formspree form, or a Google Apps
   Script like the Netwave booking one). Until then, the form thanks people but their
   request isn't sent, and the page says so.
2. **Anyone can sign in to the preview** with any email and password. That's fine for showing
   it around, since it only has sample data, but don't treat it as private yet.
3. **Link previews:** put the full address of `assets/social-preview.png` in the `og:image`
   line in `index.html`.

## Making it real (the backend)

1. **Accounts:** a sign-in service (e.g. Supabase Auth, Firebase Auth or Clerk) or your own.
   Fill in the functions in `auth.js` with it and set `PREVIEW = false`. Invite only means
   new accounts come from invites you send, not from a sign-up form.
2. **The app's server:** put Bizfinder's Python server (`bizfinder/server.py`) online, with
   searches, spreadsheets and call notes kept per account. It answers the same `/api/...`
   requests as `app/demo-api.js` does now. Then take `demo-api.js` out of `app/index.html`
   (in `tools/sync_app.py`).
3. **Map keys** then live on the server, not with each user. Google Maps and TomTom charge
   per request, so decide who pays for searches before opening it up.
4. **The map tiles** come from OpenStreetMap's own servers, which is fine for a few users.
   For a public service, use a tile provider (their usage policy asks for this).

## Looking at it locally

In this folder: `python3 -m http.server 4610`, then open <http://127.0.0.1:4610>. Opening
the files directly (double-clicking `index.html`) doesn't work for the app, because browsers
don't let pages read the sample files that way.
