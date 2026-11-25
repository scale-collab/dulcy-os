// Applies the theme picked in HQ (light / dark) before the page paints, so there is no flash.
// "System" (nothing saved) follows the phone/computer setting. It is a file, not an inline
// script, because HQ's CSP allows scripts from this site only.
(function () {
  try {
    var t = localStorage.getItem('hq-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
