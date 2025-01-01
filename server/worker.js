import createCallbackStore from '../lib/createCallbackStore.js';
import createSuperJSON from '../lib/createSuperJSON.js';

self.addEventListener('message', async (event) => {
  const port = event.ports[0];

  const callbacks = createCallbackStore();
  const run = (id, args) =>
    new Promise(resolve => {
      port.postMessage(['callback', { id, args, resolve: callbacks.add(resolve) }]);
    });
  const superjson = createSuperJSON(callbacks.add, run);

  port.onmessage = async event => {
    const [action, message] = event.data;
    const { id, errorId, code, scope, args, resolve, reject } = message;

    if (action === 'execute') {
      const parsedScope = superjson.parse(scope);

      try {
        globalThis.workerboxScope = parsedScope
        eval?.(code)
      } catch (error) {
        port.postMessage(['error', { id: errorId, args: superjson.stringify([error]) }]);
      }
    }

    if (action === 'callback') {
      const parsedArgs = superjson.parse(args);

      const fn = callbacks.get(id);
      if (!fn) {
        return;
      }
      try {
        const result = await fn(...parsedArgs);
        port.postMessage(['return', { id: resolve, args: superjson.stringify([result]) }]);
      } catch (error) {
        port.postMessage(['error', { id: reject, args: superjson.stringify([error]) }]);
      }
    }
  };
});
