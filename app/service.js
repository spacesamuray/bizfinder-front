// The Bizfinder app as a web service: only for people who are signed in. Adds the account
// panel (who's signed in, Sign out) and, in the preview, a "Sample data" note. Runs before
// the app, from <head>.
(function () {
  const Auth = window.BizfinderAuth;
  const user = Auth.user();
  if (!user) {
    // Back to the same place in the app after signing in
    location.replace(`../signin.html?next=${encodeURIComponent(`app/${location.hash}`)}`);
    return;
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const initials = (user.name || user.email)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  document.addEventListener('DOMContentLoaded', () => {
    const side = document.querySelector('.side');
    if (Auth.PREVIEW) {
      const note = document.createElement('p');
      note.className = 'preview-tag';
      note.title = 'Every business here is made up. Searches and notes stay in this browser.';
      note.innerHTML = '<span class="preview-dot"></span>Preview · sample data';
      side.querySelector('.brand').after(note);
    }
    const panel = document.createElement('div');
    panel.className = 'account';
    panel.innerHTML = `<span class="account-avatar" aria-hidden="true">${esc(initials)}</span>
      <span class="account-who"><b>${esc(user.name || user.email)}</b><small>${esc(user.email)}</small></span>
      <button type="button" class="btn btn-sm btn-quiet" data-sign-out>Sign out</button>`;
    side.append(panel);
    panel.querySelector('[data-sign-out]').addEventListener('click', async () => {
      await Auth.signOut();
      location.assign('../');
    });
  });

  // "Download .xlsx" links to the server; in the preview, hand over the sample spreadsheet.
  document.addEventListener(
    'click',
    async (e) => {
      const link = e.target.closest('a[href^="/api/download"]');
      if (!link || !window.BizfinderDemo) return;
      e.preventDefault();
      const file = new URL(link.href).searchParams.get('file');
      const sample = await window.BizfinderDemo.sampleFor(file);
      const a = Object.assign(document.createElement('a'), { href: `demo/${sample}.xlsx`, download: file });
      document.body.append(a);
      a.click();
      a.remove();
    },
    true,
  );
})();
