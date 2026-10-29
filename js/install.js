/** install.js — Capture de l'événement d'installation PWA (beforeinstallprompt). */
let installEvent = null;
export const getInstallEvent = () => installEvent;
if (typeof addEventListener === 'function') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    document.dispatchEvent(new CustomEvent('lc:installable'));
  });
}
