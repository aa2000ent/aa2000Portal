// Sets the initial theme before paint to avoid a flash.
// Kept as an external (same-origin) file so index.html carries NO inline script,
// which lets the Content-Security-Policy use a strict `script-src 'self'`.
(function () {
  try {
    var t = localStorage.getItem('aa-portal-theme');
    document.documentElement.setAttribute('data-theme', t === 'light' || t === 'dark' ? t : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
