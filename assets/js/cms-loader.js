/**
 * cms-loader.js — lazy-loads the CMS (Supabase + cms.js, ~210KB) only once
 * the browser is idle, so it never competes with initial paint/interactivity.
 * The static HTML already shown is accurate as of the last deploy — live
 * sync is a nice-to-have, not something worth spending first-load budget on.
 *
 * Kept as an external file (not inline <script>) because the site's strict
 * Content-Security-Policy (script-src 'self') blocks inline scripts.
 */
function loadPortfolioCMS() {
  var s1 = document.createElement('script');
  s1.src = 'assets/js/vendor/supabase.min.js';
  s1.onload = function () {
    var s2 = document.createElement('script');
    s2.src = 'assets/js/cms.js';
    document.body.appendChild(s2);
  };
  document.body.appendChild(s1);
}
if ('requestIdleCallback' in window) {
  requestIdleCallback(loadPortfolioCMS, { timeout: 3000 });
} else {
  window.addEventListener('load', function () { setTimeout(loadPortfolioCMS, 1200); });
}
