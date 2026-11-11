// Sign-in for the Bizfinder web service, shared by every page.
//
// FRONT END ONLY FOR NOW (PREVIEW = true): there are no real accounts yet. Any email and
// password signs in, and the session lives in this browser. To connect a real backend,
// replace what these functions do with calls to your API and set PREVIEW to false; the
// pages only ever use the functions below.
window.BizfinderAuth = (function () {
  const PREVIEW = true;
  // Where "Request access" sends its form, as JSON (e.g. a Formspree or Google Apps Script
  // address). While empty, requests aren't sent anywhere, and the page says so.
  const REQUEST_ACCESS_URL = '';

  const SESSION = 'bizfinder:account';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // private window or storage turned off: the session lasts until the tab closes
    }
  };

  /** An error the form shows next to `field` (or above the button when there's none). */
  function problem(message, field) {
    const err = new Error(message);
    err.field = field;
    throw err;
  }

  const cleanEmail = (email) => String(email || '').trim().toLowerCase();

  function checkEmail(email, field = 'email') {
    if (!email) problem('Enter your email address.', field);
    if (!EMAIL.test(email)) problem('That doesn’t look like an email address. Check it and try again.', field);
  }

  // "nino.beridze@…" -> "Nino Beridze": a name to greet people with until they set one
  const nameFrom = (email) =>
    email
      .split('@')[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');

  let memory = null; // when storage is blocked

  function start(email, name) {
    const user = { email, name: name || nameFrom(email), since: new Date().toISOString() };
    memory = user;
    write(SESSION, user);
    return user;
  }

  return {
    PREVIEW,
    REQUEST_ACCESS_URL,

    /** The signed-in person ({ email, name }) or null. */
    user() {
      return read(SESSION) || memory;
    },

    async signIn(email, password) {
      email = cleanEmail(email);
      checkEmail(email);
      if (!password) problem('Enter your password.', 'password');
      await wait(450);
      if (!PREVIEW) problem('Signing in isn’t connected yet.');
      return start(email);
    },

    async signOut() {
      memory = null;
      write(SESSION, null);
    },

    async requestAccess({ name, email, company, note }) {
      name = String(name || '').trim();
      email = cleanEmail(email);
      if (!name) problem('Enter your name.', 'name');
      checkEmail(email);
      const request = { name, email, company: String(company || '').trim(), note: String(note || '').trim() };
      if (REQUEST_ACCESS_URL) {
        let res;
        try {
          res = await fetch(REQUEST_ACCESS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(request),
          });
        } catch {
          problem('Couldn’t send your request. Check your internet connection and try again.');
        }
        if (!res.ok) problem('Couldn’t send your request just now. Please try again in a minute.');
        return request;
      }
      if (!PREVIEW) problem('Requests can’t be sent yet.');
      await wait(500);
      return request;
    },

    async forgotPassword(email) {
      email = cleanEmail(email);
      checkEmail(email);
      await wait(500);
      if (!PREVIEW) problem('Resetting passwords isn’t connected yet.');
      return email;
    },

    async acceptInvite({ email, name, password, confirm, token }) {
      email = cleanEmail(email);
      name = String(name || '').trim();
      checkEmail(email);
      if (!name) problem('Enter your name.', 'name');
      if (String(password || '').length < 8) problem('Use at least 8 characters.', 'password');
      if (password !== confirm) problem('The two passwords don’t match.', 'confirm');
      await wait(500);
      if (!PREVIEW && !token) problem('This invite link isn’t complete. Open the link from your invite email again.');
      if (!PREVIEW) problem('Creating accounts isn’t connected yet.');
      return start(email, name);
    },
  };
})();
