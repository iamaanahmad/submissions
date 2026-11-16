export function refreshWhenVisible(doc, refresh) {
  const checkOnReturn = () => {
    if (doc.visibilityState === 'visible') refresh();
  };
  doc.addEventListener('visibilitychange', checkOnReturn);
  return () => doc.removeEventListener('visibilitychange', checkOnReturn);
}
