export function refreshWhenOnline(browser, refresh, onOffline = () => {}) {
  const checkOnReturn = () => refresh();
  browser.addEventListener('online', checkOnReturn);
  browser.addEventListener('offline', onOffline);
  return () => {
    browser.removeEventListener('online', checkOnReturn);
    browser.removeEventListener('offline', onOffline);
  };
}
