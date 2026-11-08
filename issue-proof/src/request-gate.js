export function createRequestGate() {
  let latest = 0;
  return {
    start() {
      latest += 1;
      return latest;
    },
    isCurrent(request) {
      return request === latest;
    },
    invalidate() {
      latest += 1;
    }
  };
}
