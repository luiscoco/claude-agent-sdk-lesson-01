export const SDK_VERSION = '0.3.310';
export const DEFAULT_PROMPT =
  "Read README.md and src/tasks.ts. Summarize this project's purpose, name its three task functions, and suggest one next learning step. Do not change any files.";
export type Mode = 'demo' | 'live';
export type Stage = 'host' | 'agent' | 'stream' | 'result';
export type RunStatus = 'success' | 'error' | 'cancelled';
export interface MessageView {
  type: string;
  subtype?: string;
  text: string;
  toolName?: string;
  envelope: Record<string, unknown>;
  final?: { ok: boolean; text: string };
}
export type LabEvent =
  | { kind: 'stage'; stage: Stage; text: string }
  | { kind: 'message'; message: MessageView }
  | { kind: 'done'; status: RunStatus }
  | { kind: 'error'; text: string };
export interface PackageEntry {
  path: string;
  label: string;
  purpose: string;
  runtime: string | null;
  types: string | null;
  example: string;
}
export interface LessonInfo {
  sdkVersion: string;
  defaultPrompt: string;
  liveAvailable: boolean;
  maxTurns: number;
  maxBudgetUsd: number;
  entries: PackageEntry[];
}
export interface FixtureFile {
  path: string;
  content: string;
}
export const EXPLANATIONS: Record<string, string> = {
  system: 'The runtime reports session information. Initialization is not the final answer.',
  assistant:
    'The agent may explain its work or request a tool. An assistant message does not mean the run is finished.',
  user: 'A user-shaped SDK message can carry a tool result back to the agent; it is not necessarily a new human prompt.',
  result:
    'The result message reports the outcome. Check its subtype and error flag before treating it as success.',
};
export const QUESTIONS = [
  {
    question: 'Which part supplies the prompt and chooses the working directory?',
    answers: ['The host application', 'The message stream', 'The final result'],
    correct: 0,
    explanation:
      'The host owns the request and configuration; the agent performs the task within that context.',
  },
  {
    question: 'Which import should you begin with in this Node.js sample?',
    answers: [
      'The browser entry',
      'The root @anthropic-ai/claude-agent-sdk entry',
      'A runtime import from /sdk-tools',
    ],
    correct: 1,
    explanation: 'The root entry exposes query(). /sdk-tools is type-only in version 0.3.310.',
  },
  {
    question: 'You receive an assistant message. Has the run definitely finished?',
    answers: [
      'Yes, every assistant message is final',
      'Yes, if it contains text',
      'No; inspect the result message and its outcome',
    ],
    correct: 2,
    explanation:
      'Assistant messages can arrive before tool calls and further work. A result can also report an error.',
  },
  {
    question: 'Why pin version 0.3.310 for this lesson?',
    answers: [
      'It guarantees every API will never change',
      'It matches the course examples to a specific API surface',
      'It makes experimental APIs stable',
    ],
    correct: 1,
    explanation:
      'A version gives an example context. Read status labels and the matching release notes when changing it.',
  },
] as const;
