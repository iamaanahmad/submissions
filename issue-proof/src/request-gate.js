export function createRequestGate() {
  let latest = 0;
  let manualRequest = null;
  return {
    start({ manual = false } = {}) {
      if (!manual && manualRequest !== null) return null;
      latest += 1;
      manualRequest = manual ? latest : null;
      return latest;
    },
    isCurrent(request) {
      return request !== null && request === latest;
    },
    finish(request) {
      if (request === manualRequest) manualRequest = null;
    },
    invalidate() {
      latest += 1;
      manualRequest = null;
    }
  };
}
