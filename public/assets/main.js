// Scroll reveals, header shadow, and progressive enhancement for the contact form.
// Everything works without JavaScript; this file only adds polish.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Elements with .reveal start hidden only once JS is known to be running.
  document.documentElement.classList.add('js');

  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    revealEls.forEach((el) => observer.observe(el));
  }

  // Header picks up a shadow once the page is scrolled.
  const header = document.querySelector('.site-header');
  if (header) {
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  // Highlight the services sub-nav link for the section in view.
  const subnavLinks = document.querySelectorAll('.subnav a[href^="#"]');
  if (subnavLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map([...subnavLinks].map((a) => [a.getAttribute('href').slice(1), a]));
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          subnavLinks.forEach((a) => a.removeAttribute('aria-current'));
          byId.get(entry.target.id)?.setAttribute('aria-current', 'true');
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    byId.forEach((_, id) => {
      const target = document.getElementById(id);
      if (target) sectionObserver.observe(target);
    });
  }

  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const alertBox = form.querySelector('[data-form-alert]');
  const button = form.querySelector('button[type="submit"]');
  const fields = ['name', 'email', 'phone', 'service', 'details'];

  function showErrors(errors) {
    for (const name of fields) {
      const input = form.elements[name];
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      const message = errors[name] || '';
      slot.textContent = message;
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    const first = fields.find((name) => errors[name]);
    if (first) form.elements[first].focus();
  }

  function showAlert(message) {
    form.querySelectorAll('.form-alert:not([data-form-alert])').forEach((el) => el.remove());
    alertBox.textContent = message;
    alertBox.hidden = !message;
    if (message) alertBox.focus();
  }

  function clientErrors() {
    const v = (name) => form.elements[name].value.trim();
    const errors = {};
    if (!v('name')) errors.name = 'Please enter your name.';
    if (!v('email')) errors.email = 'Please enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) errors.email = 'Please enter a valid email address.';
    if (!v('details')) errors.details = 'Please tell us a little about your project.';
    if (form.elements.sms_consent.checked && !v('phone')) {
      errors.phone = 'Enter your mobile number to receive text messages, or uncheck the text message box.';
    }
    return errors;
  }

  // Clear a field's error as soon as the visitor starts fixing it.
  for (const name of fields) {
    form.elements[name].addEventListener('input', () => {
      form.querySelector(`[data-error-for="${name}"]`).textContent = '';
      form.elements[name].removeAttribute('aria-invalid');
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errors = clientErrors();
    showErrors(errors);
    if (Object.keys(errors).length) return;

    showAlert('');
    button.disabled = true;
    button.classList.add('is-busy');
    button.textContent = 'Sending…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.assign(data.redirect);
        return;
      }
      if (data.errors) showErrors(data.errors);
      showAlert(data.message || 'Please fix the highlighted fields below.');
    } catch {
      showAlert('We could not send your message. Please check your connection and try again.');
    }
    button.disabled = false;
    button.classList.remove('is-busy');
    button.textContent = 'Send message';
  });
})();
