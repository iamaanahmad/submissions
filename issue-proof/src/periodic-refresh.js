export function refreshWhileVisible(doc, refresh, schedule = setInterval, cancel = clearInterval) {
  const interval = schedule(() => {
    if (doc.visibilityState === 'visible') refresh();
  }, 5 * 60 * 1000);
  return () => cancel(interval);
}
