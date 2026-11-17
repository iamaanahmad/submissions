export function refreshWhenVisible(doc, refresh) {
  const checkOnReturn = () => {
    if (doc.visibilityState === 'visible') refresh();
  };
  doc.addEventListener('visibilitychange', checkOnReturn);
  return () => doc.removeEventListener('visibilitychange', checkOnReturn);
}

export function refreshWhenFocused(win, doc, refresh, shouldRefresh) {
  const checkOnFocus = () => {
    if (doc.visibilityState === 'visible' && shouldRefresh()) refresh();
  };
  win.addEventListener('focus', checkOnFocus);
  return () => win.removeEventListener('focus', checkOnFocus);
}
