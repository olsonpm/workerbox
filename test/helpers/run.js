import puppeteer from 'puppeteer';
import debounce from 'debounce';
import createServer from './createServer.js';

async function run (code) {
  const server = await createServer(code);
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: null,
    devtools: true,
    args: ['--ignore-certificate-errors']
  });

  const cleanup = debounce(() => {
    browser.close();
    server.close();
  }, 300);

  const [page] = await browser.pages();

  const result = new Promise((resolve, reject) => {
    page.on('error', console.log);
    page.on('pageerror', (error) => {
      cleanup();
      setTimeout(() => reject(error), 300);
    });
    page.on('console', async message => {
      const describe = arg => arg
        .executionContext()
        .evaluate(object => {
          if (object instanceof Error) {
            return object.stack;
          }
          if (typeof object === 'object') {
            const getCircularReplacer = () => {
              const seen = new WeakSet();
              return (key, value) => {
                if (typeof value === 'object' && value !== null) {
                  if (seen.has(value)) {
                    return;
                  }
                  seen.add(value);
                }
                return value;
              };
            };
            return JSON.stringify(object, getCircularReplacer(), 2);
          }
          return object;
        }, arg);

      const messages = [];
      for (const arg of message.args()) {
        const parsedMessage = await describe(arg);
        if (!parsedMessage?.startsWith?.('$$TEST_BROWSER_CLOSE$$:')) {
          messages.push(parsedMessage);
        }
      }
      console.log(...messages);

      const text = message.text();

      if (text.startsWith('$$TEST_BROWSER_CLOSE$$:')) {
        const result = text.slice('$$TEST_BROWSER_CLOSE$$:'.length);
        cleanup();
        resolve(JSON.parse(result));
      }
    });
  });

  await page.goto(server.url);

  return result;
}

export default run;
