/** Promise-based application boundary; identity and shop selection belong to Firebase. */
export function call(method, ...args) {
  if (!window.posApi) return Promise.reject(new Error('尚未連接 Firebase'));
  return window.posApi.call(method, args);
}

export function isConnected() {
  return Boolean(window.posApi);
}

// Temporary callback facade for migrated feature controllers. Each chain is isolated.
function runner(success = () => {}, failure = console.error) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'withSuccessHandler') return (handler) => runner(handler, failure);
        if (property === 'withFailureHandler') return (handler) => runner(success, handler);
        if (property === 'then') return undefined;
        return (...args) =>
          call(String(property), ...args)
            .then(success)
            .catch(failure);
      },
    },
  );
}
export const rpc = runner();
