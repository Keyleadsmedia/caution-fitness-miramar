document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const navToggle = document.querySelector('.nav_toggle');
  const navLinks = document.querySelectorAll('.nav_link');

  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  };

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  navLinks.forEach(link => link.addEventListener('click', closeMenu));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) closeMenu();
  });

  // Mark the current page in the nav
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) link.classList.add('is-current');
  });

  // Scroll reveal
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
  }

  // Record which page converted, so Source Page in Client Leads is the
  // actual page rather than the site root Netlify reports by default.
  var pageUrlField = document.getElementById('pageUrl');
  if (pageUrlField) pageUrlField.value = window.location.href;

  // NOTE: forms submit natively to Netlify. Do not preventDefault here —
  // the previous template faked a success message and silently dropped every lead.
});
