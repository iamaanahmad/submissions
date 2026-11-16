export function refreshWhenOnline(browser, refresh) {
  browser.addEventListener('online', refresh);
  return () => browser.removeEventListener('online', refresh);
}
