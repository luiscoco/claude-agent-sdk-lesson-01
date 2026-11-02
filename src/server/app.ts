import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_PROMPT,
  SDK_VERSION,
  type LabEvent,
  type LessonInfo,
  type RunStatus,
} from '../shared/lesson.js';
import { FIXTURE_ROOT, FIXTURE_PATHS } from './paths.js';
import { inspectPackage } from './package-map.js';
import { runDemo } from './demo.js';
import { runLive, MAX_TURNS, MAX_BUDGET_USD } from './live.js';
import { safeError } from './messages.js';

type Runner = (request: { prompt: string; signal: AbortSignal }) => AsyncIterable<LabEvent>;
export interface AppOptions {
  liveAvailable?: boolean;
  liveRunner?: Runner;
  demoDelayMs?: number;
  timeoutMs?: number;
}
export function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += Buffer.byteLength(chunk);
    if (length > 8_192) throw new Error('Request body must be smaller than 8 KB.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function createApiHandler(options: AppOptions = {}) {
  let active = false;
  const liveAvailable = options.liveAvailable ?? Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (!pathname.startsWith('/api/')) return false;
    if (request.method === 'GET' && pathname === '/api/lesson') {
      const pkg = await inspectPackage();
      if (pkg.version !== SDK_VERSION)
        throw new Error('The installed SDK does not match this version-pinned lesson. Run npm ci.');
      const lesson: LessonInfo = {
        sdkVersion: pkg.version,
        defaultPrompt: DEFAULT_PROMPT,
        liveAvailable,
        maxTurns: MAX_TURNS,
        maxBudgetUsd: MAX_BUDGET_USD,
        entries: pkg.entries,
      };
      json(response, 200, lesson);
      return true;
    }
    if (request.method === 'GET' && pathname === '/api/fixture') {
      const files = await Promise.all(
        FIXTURE_PATHS.map(async (file) => ({
          path: file,
          content: await readFile(path.join(FIXTURE_ROOT, file), 'utf8'),
        })),
      );
      json(response, 200, files);
      return true;
    }
    if (request.method !== 'POST' || pathname !== '/api/run') {
      json(response, 404, { error: 'Unknown API endpoint.' });
      return true;
    }
    // This is a local teaching host, not a remotely exposed model proxy.
    if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
      json(response, 403, { error: 'Cross-origin query requests are not allowed.' });
      return true;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      json(response, 415, { error: 'Send an application/json request.' });
      return true;
    }
    let input: unknown;
    try {
      input = await body(request);
    } catch {
      json(response, 400, { error: 'Provide valid JSON no larger than 8 KB.' });
      return true;
    }
    if (
      typeof input !== 'object' ||
      input === null ||
      !('mode' in input) ||
      !['demo', 'live'].includes(String(input.mode))
    ) {
      json(response, 400, { error: 'Choose demo or live mode.' });
      return true;
    }
    const mode = input.mode;
    const prompt =
      mode === 'demo'
        ? DEFAULT_PROMPT
        : 'prompt' in input && typeof input.prompt === 'string'
          ? input.prompt.trim()
          : '';
    if (prompt.length < 10 || prompt.length > 2_000) {
      json(response, 400, { error: 'Use a prompt between 10 and 2,000 characters.' });
      return true;
    }
    if (mode === 'live' && !liveAvailable) {
      json(response, 409, {
        error:
          'Live mode needs ANTHROPIC_API_KEY in the server .env file. The guided demo works without it.',
      });
      return true;
    }
    if (active) {
      json(response, 409, {
        error: 'A query is already running. Stop it before starting another.',
      });
      return true;
    }
    active = true;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('Query time limit reached.')),
      options.timeoutMs ?? 90_000,
    );
    const disconnected = () => controller.abort();
    response.on('close', disconnected);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    response.flushHeaders();
    const send = (event: LabEvent) => {
      if (!response.destroyed) response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!response.destroyed) response.write(': waiting\n\n');
    }, 10_000);
    let status: RunStatus = 'error';
    try {
      const events =
        mode === 'demo'
          ? runDemo({ signal: controller.signal, delayMs: options.demoDelayMs ?? 700 })
          : (options.liveRunner ?? runLive)({ prompt, signal: controller.signal });
      for await (const event of events) {
        if (event.kind === 'message' && event.message.final)
          status = event.message.final.ok ? 'success' : 'error';
        send(event);
      }
      if (status === 'error')
        send({
          kind: 'error',
          text: 'The query did not produce a successful result. Inspect the final message.',
        });
    } catch (error) {
      status = controller.signal.aborted ? 'cancelled' : 'error';
      send({
        kind: 'error',
        text:
          status === 'cancelled'
            ? 'The run was cancelled or reached its time limit.'
            : safeError(error),
      });
    } finally {
      clearTimeout(timer);
      clearInterval(heartbeat);
      controller.abort();
      active = false;
      send({ kind: 'done', status });
      response.off('close', disconnected);
      response.end();
    }
    return true;
  };
}
