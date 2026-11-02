import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApiHandler } from '../src/server/app.js';
import { createEventParser } from '../src/shared/sse.js';
import type { LabEvent } from '../src/shared/lesson.js';

async function host(options: Parameters<typeof createApiHandler>[0] = {}) {
  const handler = createApiHandler({ demoDelayMs: 0, ...options });
  const server = createServer((request, response) => {
    void handler(request, response)
      .then((handled) => {
        if (!handled) {
          response.writeHead(404);
          response.end();
        }
      })
      .catch(() => {
        response.writeHead(500);
        response.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
const request = (value: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(value),
});
test('HTTP guided replay completes without credentials and returns the selected message stream', async () => {
  const app = await host({ liveAvailable: false });
  try {
    const config = (await (await fetch(`${app.url}/api/lesson`)).json()) as {
      liveAvailable: boolean;
      sdkVersion: string;
    };
    assert.equal(config.liveAvailable, false);
    assert.equal(config.sdkVersion, '0.3.310');
    const response = await fetch(`${app.url}/api/run`, request({ mode: 'demo' }));
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const events: LabEvent[] = [];
    createEventParser((value) => events.push(value as LabEvent))(await response.text());
    assert.deepEqual(events.at(-1), { kind: 'done', status: 'success' });
    assert.equal(events.filter((event) => event.kind === 'message').length, 7);
  } finally {
    await app.close();
  }
});
test('fixture endpoint only exposes the three bundled teaching files', async () => {
  const app = await host();
  try {
    const files = (await (await fetch(`${app.url}/api/fixture`)).json()) as { path: string }[];
    assert.deepEqual(
      files.map((file) => file.path),
      ['README.md', 'package.json', 'src/tasks.ts'],
    );
  } finally {
    await app.close();
  }
});
test('live mode without a server API key is rejected rather than converted to a fake answer', async () => {
  const app = await host({ liveAvailable: false });
  try {
    const response = await fetch(
      `${app.url}/api/run`,
      request({ mode: 'live', prompt: 'Summarize this project.' }),
    );
    assert.equal(response.status, 409);
    assert.match(await response.text(), /ANTHROPIC_API_KEY/);
  } finally {
    await app.close();
  }
});
test('a real SDK error result is exposed as failure by the HTTP host', async () => {
  const app = await host({
    liveAvailable: true,
    liveRunner: async function* () {
      yield {
        kind: 'message',
        message: {
          type: 'result',
          subtype: 'error_max_turns',
          text: 'Limit reached',
          final: { ok: false, text: 'Limit reached' },
          envelope: { type: 'result' },
        },
      };
    },
  });
  try {
    const response = await fetch(
      `${app.url}/api/run`,
      request({ mode: 'live', prompt: 'Summarize the project.' }),
    );
    const events: LabEvent[] = [];
    createEventParser((value) => events.push(value as LabEvent))(await response.text());
    assert.deepEqual(events.at(-1), { kind: 'done', status: 'error' });
  } finally {
    await app.close();
  }
});
test('invalid mode, malformed JSON, oversized input, and cross-origin requests are rejected', async () => {
  const app = await host();
  try {
    assert.equal((await fetch(`${app.url}/api/run`, request({ mode: 'unknown' }))).status, 400);
    assert.equal((await fetch(`${app.url}/api/run`, { ...request({}), body: '{' })).status, 400);
    assert.equal(
      (await fetch(`${app.url}/api/run`, request({ mode: 'live', prompt: 'x'.repeat(9000) })))
        .status,
      400,
    );
    assert.equal(
      (
        await fetch(
          `${app.url}/api/run`,
          request({ mode: 'demo' }, { Origin: 'https://unrelated.example' }),
        )
      ).status,
      403,
    );
  } finally {
    await app.close();
  }
});
test('disconnecting a live stream aborts the active host runner', async () => {
  let aborted = false;
  const app = await host({
    liveAvailable: true,
    liveRunner: async function* ({ signal }) {
      yield { kind: 'stage', stage: 'host', text: 'Started' };
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
    },
  });
  try {
    const controller = new AbortController();
    const response = await fetch(`${app.url}/api/run`, {
      ...request({ mode: 'live', prompt: 'Summarize the project.' }),
      signal: controller.signal,
    });
    await response.body?.getReader().read();
    controller.abort();
    for (let i = 0; i < 30 && !aborted; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(aborted, true);
  } finally {
    await app.close();
  }
});
