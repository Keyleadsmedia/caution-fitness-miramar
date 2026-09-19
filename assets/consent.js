/*!
 * Key Leads Media — cookie consent + tracker gating
 *
 * The point of this file is NOT the banner. It is that nothing tracking-related
 * loads until there is a lawful basis to load it. A banner that shows while the
 * pixel already fired is worse than no banner, because it is a written statement
 * that is false. CIPA section 638.51 claims turn on exactly that.
 *
 * Behaviour:
 *   - No trackers configured  -> no banner at all. Nothing to consent to.
 *   - Global Privacy Control  -> treated as a decline. Recorded, no banner shown,
 *                                nothing loads. 12 states require honouring it.
 *   - No stored choice        -> banner shown, NOTHING loads until Accept.
 *   - Accept                  -> choice stored 12 months, trackers injected.
 *   - Decline                 -> choice stored 12 months, nothing injected, ever.
 *
 * Per-site config, set inline before this script:
 *   window.KLM_TRACKING = { ga4: 'G-XXXXXXX', metaPixel: '000000', metricool: 'hash' };
 * Leave a key out or empty and that tracker simply does not exist for this site.
 *
 * Re-open from anywhere:  <a href="#" onclick="klmConsent.open();return false">Cookie settings</a>
 */
(function () {
  'use strict';

  var KEY = 'klm-consent-v1';
  var MAX_AGE_DAYS = 365;
  var cfg = window.KLM_TRACKING || {};
  var hasTrackers = !!(cfg.ga4 || cfg.metaPixel || cfg.metricool);

  /* ---------- storage, defensive: private mode and blocked storage both throw ---------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || !v.at) return null;
      if ((Date.now() - v.at) / 86400000 > MAX_AGE_DAYS) return null;
      return v;
    } catch (e) { return null; }
  }
  function write(choice, reason) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: choice, reason: reason || 'banner', at: Date.now() })); }
    catch (e) { /* session-only is an acceptable fallback */ }
  }

  /* ---------- tracker injection, only ever called after an explicit accept ---------- */
  var injected = false;
  function injectTrackers() {
    if (injected) return;
    injected = true;

    if (cfg.ga4) {
      var g = document.createElement('script');
      g.async = true;
      g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4);
      document.head.appendChild(g);
      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', cfg.ga4, { anonymize_ip: true });
    }

    if (cfg.metaPixel) {
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', cfg.metaPixel);
      window.fbq('track', 'PageView');
    }

    if (cfg.metricool) {
      var m = document.createElement('script');
      m.async = true;
      m.src = 'https://tracker.metricool.com/resources/be.js';
      m.onload = function () {
        try { window.beTracker && window.beTracker.t({ hash: cfg.metricool }); } catch (e) {}
      };
      document.head.appendChild(m);
    }
  }

  /* ---------- banner ---------- */
  var el = null;
  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'klm-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Cookie choices');
    el.innerHTML =
      '<div class="klm-consent__in">' +
        '<p class="klm-consent__text"><span class="klm-consent__state"></span>We use cookies to measure how this site is used and how our advertising performs. ' +
        'Nothing is loaded until you choose. See our <a href="privacy.html">Privacy Policy</a>.</p>' +
        '<div class="klm-consent__btns">' +
          '<button type="button" class="klm-consent__btn klm-consent__btn--ghost" data-klm="decline">Decline</button>' +
          '<button type="button" class="klm-consent__btn klm-consent__btn--solid" data-klm="accept">Accept</button>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-klm');
      if (a !== 'accept' && a !== 'decline') return;
      var prior = read();
      var changed = prior && prior.choice !== a;
      write(a);
      if (a === 'accept' && !changed) { injectTrackers(); hide(); return; }
      hide();
      // Going from accept to decline cannot unload a script that already ran,
      // and going from decline to accept needs a clean page to fire PageView.
      // Reload so the stored choice is what the page actually does.
      if (changed) { location.reload(); return; }
      if (a === 'accept') injectTrackers();
    });
    document.body.appendChild(el);
    return el;
  }
  function show() {
    var node = build();
    var prior = read();
    var line = node.querySelector('.klm-consent__state');
    if (line) {
      line.textContent = prior
        ? (prior.choice === 'accept'
            ? 'You currently allow these cookies. '
            : 'You currently decline these cookies. ')
        : '';
    }
    node.classList.add('is-open');
    // The GHL chat widget floats bottom-right with a very high z-index and
    // swallows clicks aimed at the Accept/Decline buttons. Hold it back until
    // a choice is made. It also should not be able to take a phone number
    // before the visitor has answered the cookie question.
    document.documentElement.classList.add('klm-consent-open');
  }
  function hide() {
    if (el) el.classList.remove('is-open');
    document.documentElement.classList.remove('klm-consent-open');
  }

  /* ---------- decide ---------- */
  function syncLinks() {
    // A "Cookie settings" link that opens nothing is worse than no link.
    var links = document.querySelectorAll('.klm-consent-link');
    for (var i = 0; i < links.length; i++) {
      links[i].style.display = hasTrackers ? '' : 'none';
      var sep = links[i].previousElementSibling;
      if (!hasTrackers && sep && sep.getAttribute('aria-hidden') === 'true') sep.style.display = 'none';
    }
  }

  function start() {
    syncLinks();
    if (!hasTrackers) return;                 // nothing to consent to

    // Global Privacy Control is a legal opt-out signal in 12 states. Treat it as a decline.
    if (navigator.globalPrivacyControl === true) { write('decline', 'gpc'); return; }

    var prior = read();
    if (prior && prior.choice === 'accept') { injectTrackers(); return; }
    if (prior && prior.choice === 'decline') { return; }
    show();
  }

  window.klmConsent = {
    open: function () { if (hasTrackers) show(); },
    state: function () { var p = read(); return p ? p.choice : 'unset'; },
    revoke: function () { write('decline', 'revoked'); location.reload(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
