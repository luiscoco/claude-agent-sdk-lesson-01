import './style.css';
import './course-theme.css';
import './course-theme.js';
import {
  EXPLANATIONS,
  QUESTIONS,
  type FixtureFile,
  type LabEvent,
  type LessonInfo,
  type MessageView,
  type Mode,
  type Stage,
} from '../shared/lesson.js';
import { observeCode } from './highlight.js';
import { renderMarkdown } from './markdown.js';
import { createEventParser } from '../shared/sse.js';
const el = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
const mode = el<HTMLSelectElement>('#mode');
const prompt = el<HTMLTextAreaElement>('#prompt');
const run = el<HTMLButtonElement>('#run');
const stop = el<HTMLButtonElement>('#stop');
const exportButton = el<HTMLButtonElement>('#export');
observeCode();
let info: LessonInfo;
let controller: AbortController | undefined;
let messages: MessageView[] = [];
let currentMode: Mode = 'demo';
let runPrompt = '';
let gotDone = false;

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
function selectTab(tab: HTMLButtonElement) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    el(`#panel-${item.dataset.tab}`).hidden = !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(tab);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    if (event.key === 'Home') next = tabs[0];
    if (event.key === 'End') next = tabs.at(-1);
    if (next) {
      event.preventDefault();
      selectTab(next);
      next.focus();
    }
  });
}
function notice(text = '') {
  el('#notice').textContent = text;
  el('#notice').hidden = !text;
}
function stage(value?: Stage, text?: string) {
  for (const item of document.querySelectorAll<HTMLElement>('[data-stage]'))
    item.classList.toggle('active', item.dataset.stage === value);
  if (text) el('#stage-caption').textContent = text;
}
function status(text: string, kind = '') {
  el('#run-status').textContent = text;
  el('#run-status').className = `status ${kind}`;
}
// Assistant text and successful results are model Markdown; tool output and errors stay literal.
const isModelText = (view: MessageView) =>
  view.type === 'assistant' || (view.type === 'result' && Boolean(view.final?.ok));
function modelText(target: HTMLElement, text: string, markdown: boolean) {
  if (markdown) renderMarkdown(target, text);
  else target.textContent = text;
  target.classList.toggle('markdown', markdown);
  return target;
}
function message(view: MessageView) {
  messages.push(view);
  el('#empty-state').hidden = true;
  const li = node('li', undefined, `message message-${view.type}`);
  const detail = node('details');
  const summary = node('summary');
  summary.append(
    node('span', String(messages.length).padStart(2, '0'), 'message-number'),
    node('code', view.type, 'message-type'),
    node(
      'span',
      view.toolName
        ? `Tool: ${view.toolName}`
        : (view.subtype ?? (view.type === 'user' ? 'tool result' : 'message')),
      'message-subtype',
    ),
  );
  detail.append(
    summary,
    node(
      'p',
      EXPLANATIONS[view.type] ?? 'A runtime message observed by the host.',
      'message-explanation',
    ),
    modelText(node('div', undefined, 'message-text'), view.text, isModelText(view)),
    node('p', 'Selected message fields', 'envelope-label'),
  );
  const pre = node('pre');
  pre.append(node('code', JSON.stringify(view.envelope, null, 2)));
  detail.append(pre);
  li.append(detail);
  el('#timeline').append(li);
  el('#message-count').textContent = `${messages.length} messages`;
  const scroll = el('#timeline-scroll');
  scroll.scrollTop = scroll.scrollHeight;
  if (view.final) {
    modelText(el('#result-text'), view.final.text, view.final.ok);
    el('#result-label').textContent = view.final.ok ? 'success' : 'error';
    el('#result-card').className = `result-card ${view.final.ok ? 'received' : 'failed'}`;
  }
}
function event(value: unknown) {
  const item = value as LabEvent;
  if (item.kind === 'stage') stage(item.stage, item.text);
  if (item.kind === 'message') message(item.message);
  if (item.kind === 'error') notice(item.text);
  if (item.kind === 'done') {
    gotDone = true;
    status(
      item.status === 'success' ? 'Complete' : item.status === 'cancelled' ? 'Cancelled' : 'Failed',
      item.status,
    );
    if (item.status === 'success')
      stage(
        'result',
        'The host received the result and finished cleanup. Expand the messages to inspect what happened.',
      );
    else stage(undefined, 'The run stopped. Review its messages before trying again.');
  }
}
function updateMode() {
  const live = mode.value === 'live';
  prompt.readOnly = !live;
  if (!live) prompt.value = info.defaultPrompt;
  el('#mode-help').textContent = live
    ? `A real model request using the server API key. Available tools: Read, Glob, Grep. Limit: ${info.maxTurns} turns and a $${info.maxBudgetUsd.toFixed(2)} SDK budget setting; charges may apply.`
    : 'A fixed, simulated message replay. It reads the fixture files but does not call Claude or answer custom prompts.';
  run.textContent = live ? 'Run live query →' : 'Run guided demo →';
}
mode.addEventListener('change', updateMode);
run.addEventListener('click', () => {
  void startRun();
});
stop.addEventListener('click', () => controller?.abort());
async function startRun() {
  if (controller) return;
  currentMode = mode.value as Mode;
  runPrompt = prompt.value;
  gotDone = false;
  controller = new AbortController();
  messages = [];
  el('#timeline').replaceChildren();
  el('#empty-state').hidden = false;
  el('#message-count').textContent = '0 messages';
  modelText(
    el('#result-text'),
    'Waiting for a result message. An assistant message alone does not mean the run has finished.',
    false,
  );
  el('#result-label').textContent = 'not received';
  el('#result-card').className = 'result-card';
  notice();
  status('Running', 'running');
  run.disabled = true;
  stop.disabled = false;
  mode.disabled = true;
  exportButton.disabled = true;
  const started = performance.now();
  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: currentMode, prompt: runPrompt }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = (await response.json()) as { error?: string };
      throw new Error(error.error ?? 'The request could not start.');
    }
    if (!response.body) throw new Error('This browser did not provide a response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parse = createEventParser(event);
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      parse(decoder.decode(result.value, { stream: true }));
    }
    parse(decoder.decode());
    if (!gotDone) throw new Error('The connection ended before the host reported completion.');
  } catch (error) {
    const cancelled = controller.signal.aborted;
    status(cancelled ? 'Cancelled' : 'Failed', cancelled ? 'cancelled' : 'error');
    stage(
      undefined,
      cancelled ? 'Run cancelled. The host closes the active query.' : 'The run could not finish.',
    );
    if (!cancelled) notice(error instanceof Error ? error.message : 'The request failed.');
  } finally {
    controller = undefined;
    run.disabled = false;
    stop.disabled = true;
    mode.disabled = false;
    exportButton.disabled = !messages.length;
    el('#elapsed').textContent =
      `${((performance.now() - started) / 1000).toFixed(1)}s · ${currentMode === 'demo' ? 'simulated replay' : 'live SDK query'}`;
  }
}
exportButton.addEventListener('click', () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          sdkVersion: info.sdkVersion,
          mode: currentMode,
          simulated: currentMode === 'demo',
          prompt: runPrompt,
          workspace: 'fixtures/tiny-project',
          note: 'Selected message fields for teaching, not the full SDK schema.',
          messages: messages.map((item) => item.envelope),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const a = node('a');
  a.href = url;
  a.download = `lesson-01-${currentMode}-trace.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function packageMap(lesson: LessonInfo) {
  const main = ['Root package', 'Core entry', 'Tool types', 'Browser entry'];
  for (const label of main) {
    const entry = lesson.entries.find((item) => item.label === label);
    if (!entry) continue;
    const card = node('article', undefined, 'card package-card');
    const top = node('div', undefined, 'package-top');
    top.append(
      node('h3', entry.label),
      node(
        'span',
        entry.runtime ? 'runtime + types' : 'type-only',
        `tag ${entry.runtime ? '' : 'type-only'}`,
      ),
    );
    card.append(top, node('code', entry.path, 'package-path'), node('p', entry.purpose));
    const code = node('pre', undefined, 'code-light');
    code.dataset.lang = 'ts';
    code.append(node('code', entry.example));
    card.append(code);
    const manifest = node('details');
    const target = node(
      'pre',
      JSON.stringify(
        { ...(entry.runtime ? { default: entry.runtime } : {}), types: entry.types },
        null,
        2,
      ),
      'code-light',
    );
    target.dataset.lang = 'json';
    manifest.append(node('summary', 'See the installed export target'), target);
    card.append(manifest);
    el('#package-grid').append(card);
  }
  for (const entry of lesson.entries.filter((item) => !main.includes(item.label)))
    el('#additional-exports').append(
      node(
        'p',
        `${entry.path} → ${entry.runtime ?? 'type-only'} (${entry.types ?? 'no declaration target'})`,
      ),
    );
}
function quiz() {
  for (const [i, item] of QUESTIONS.entries()) {
    const fieldset = node('fieldset');
    fieldset.append(node('legend', `${i + 1}. ${item.question}`));
    for (const [j, answer] of item.answers.entries()) {
      const label = node('label');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = `q${i}`;
      radio.value = String(j);
      radio.required = true;
      label.append(radio, node('span', answer));
      fieldset.append(label);
    }
    const feedback = node('p', undefined, 'quiz-feedback');
    feedback.id = `feedback-${i}`;
    feedback.hidden = true;
    fieldset.append(feedback);
    el('#quiz-questions').append(fieldset);
  }
  el<HTMLFormElement>('#quiz').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(el<HTMLFormElement>('#quiz'));
    let score = 0;
    QUESTIONS.forEach((item, i) => {
      const correct = data.get(`q${i}`) === String(item.correct);
      if (correct) score++;
      const feedback = el(`#feedback-${i}`);
      feedback.hidden = false;
      feedback.textContent = `${correct ? 'Correct.' : 'Review this one.'} ${item.explanation}`;
      feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
    });
    el('#quiz-score').textContent =
      `${score} / ${QUESTIONS.length} correct${score === QUESTIONS.length ? ' — ready for Lesson 2.' : ' — review the explanations and try again.'}`;
  });
  el<HTMLFormElement>('#quiz').addEventListener('reset', () => {
    el('#quiz-score').textContent = '';
    for (const item of document.querySelectorAll<HTMLElement>('.quiz-feedback')) item.hidden = true;
  });
}
el('#first-query-code').textContent =
  `import { query } from '@anthropic-ai/claude-agent-sdk';\n\nconst q = query({\n  prompt: 'Read README.md and summarize this project.',\n  options: {\n    cwd: fixtureDirectory,\n    tools: ['Read', 'Glob', 'Grep'],\n    allowedTools: ['Read', 'Glob', 'Grep'],\n    permissionMode: 'dontAsk'\n  }\n});\n\ntry {\n  for await (const msg of q) {\n    console.log(msg.type);\n    if (msg.type === 'result' &&\n        msg.subtype === 'success' && !msg.is_error) {\n      console.log(msg.result);\n    }\n  }\n} finally {\n  q.close();\n}`;
quiz();
// Colour fixture files by extension; the README stays plain text.
function showFile(file: FixtureFile) {
  const content = el('#file-content');
  const ext = /\.(\w+)$/.exec(file.path)?.[1];
  content.dataset.lang = ext === 'ts' || ext === 'json' ? ext : 'none';
  content.textContent = file.content;
}
async function boot() {
  const [lessonResponse, fixtureResponse] = await Promise.all([
    fetch('/api/lesson'),
    fetch('/api/fixture'),
  ]);
  if (!lessonResponse.ok || !fixtureResponse.ok)
    throw new Error('Could not load the lesson. Check the local Node.js server.');
  info = (await lessonResponse.json()) as LessonInfo;
  const files = (await fixtureResponse.json()) as FixtureFile[];
  el('#version').textContent = `SDK ${info.sdkVersion}`;
  prompt.value = info.defaultPrompt;
  const liveOption = mode.querySelector<HTMLOptionElement>('[value="live"]');
  if (liveOption) {
    liveOption.disabled = !info.liveAvailable;
    liveOption.textContent = info.liveAvailable
      ? 'Live SDK · model API charges apply'
      : 'Live SDK · configure a server API key';
  }
  for (const [i, file] of files.entries()) {
    const button = node('button', file.path, i === 0 ? 'selected' : '');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(i === 0));
    button.addEventListener('click', () => {
      for (const item of el('#file-list').querySelectorAll('button')) {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      }
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
      showFile(file);
    });
    el('#file-list').append(button);
  }
  if (files[0]) showFile(files[0]);
  packageMap(info);
  updateMode();
  run.disabled = false;
}
void boot().catch((error) =>
  notice(error instanceof Error ? error.message : 'The lesson could not load.'),
);
