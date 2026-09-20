// Keep certificate access independent of sign-in and application startup.
(() => {
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-printer-certificate]');
    if (!link) return;
    const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    // A different Hosting origin is outside the installed app's scope.
    const host = location.hostname === 'webpos-14776.firebaseapp.com'
      ? 'webpos-14776.web.app' : 'webpos-14776.firebaseapp.com';
    // Open the download page from the PWA; its own button downloads the file.
    link.href = standalone && link.hasAttribute('data-printer-certificate-page')
      ? `https://${host}/certs` : '/certs/printer-root-ca.cer';
    link.target = '_blank';
    link.rel = 'noopener';
  });
})();
