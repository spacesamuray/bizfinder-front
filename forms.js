// The sign-in pages: Sign in, Request access, Forgot password and Accept invite.
// Each has one <form data-form="...">; what it does is in auth.js.
(function () {
  const Auth = window.BizfinderAuth;
  const $ = (sel, root = document) => root.querySelector(sel);
  const form = $('form[data-form]');
  if (!form) return;
  const kind = form.dataset.form;
  const params = new URLSearchParams(location.search);

  // Where to go after signing in: only ever somewhere in the app, never another site.
  const next = (() => {
    const n = params.get('next') || '';
    return /^app\/[^:\\]*$/.test(n) && !n.includes('//') ? n : 'app/';
  })();

  if (kind === 'signin' && Auth.user()) {
    location.replace(next);
    return;
  }

  // Preview notes: shown while there's no real backend (or nowhere to send requests)
  document.querySelectorAll('[data-preview]').forEach((el) => {
    el.hidden = el.dataset.preview === 'requests' ? !!Auth.REQUEST_ACCESS_URL : !Auth.PREVIEW;
  });

  // An email in the link fills the form in (an invite link always has one)
  const email = params.get('email');
  if (email && form.email) {
    form.email.value = email;
    if (kind === 'invite') form.email.readOnly = true;
  }

  form.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-reveal]');
    if (!toggle) return;
    const input = form.elements[toggle.dataset.reveal];
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
  });

  const fieldError = (name) => $(`#${name}-error`, form);

  function clearErrors() {
    form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error, .form-error').forEach((p) => (p.hidden = true));
  }

  function showError(err) {
    const input = err.field && form.elements[err.field];
    if (input && fieldError(err.field)) {
      input.setAttribute('aria-invalid', 'true');
      fieldError(err.field).textContent = err.message;
      fieldError(err.field).hidden = false;
      input.focus();
    } else {
      const top = $('.form-error', form);
      top.textContent = err.message;
      top.hidden = false;
    }
  }

  // Fixing a field takes its message away
  form.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.hasAttribute('aria-invalid')) return;
    input.removeAttribute('aria-invalid');
    if (fieldError(input.name)) fieldError(input.name).hidden = true;
  });

  function done(values) {
    const box = $('[data-done]');
    box.querySelectorAll('[data-fill]').forEach((el) => (el.textContent = values[el.dataset.fill] || ''));
    form.hidden = true;
    box.hidden = false;
    box.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const button = $('button[type="submit"]', form);
    const label = button.textContent;
    button.disabled = true;
    button.classList.add('is-busy');
    button.textContent = button.dataset.busy || 'One moment…';
    const values = Object.fromEntries(new FormData(form));
    try {
      if (kind === 'signin') {
        await Auth.signIn(values.email, values.password);
        location.assign(next);
        return;
      }
      if (kind === 'invite') {
        await Auth.acceptInvite({ ...values, email: form.email.value, token: params.get('token') });
        location.assign('app/');
        return;
      }
      if (kind === 'request') {
        const request = await Auth.requestAccess(values);
        done({ name: request.name.split(' ')[0], email: request.email });
      }
      if (kind === 'forgot') done({ email: await Auth.forgotPassword(values.email) });
    } catch (err) {
      showError(err);
    }
    button.disabled = false;
    button.classList.remove('is-busy');
    button.textContent = label;
  });
})();
