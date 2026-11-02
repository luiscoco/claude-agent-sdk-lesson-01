import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { MessageView } from '../shared/lesson.js';
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A teaching view of selected fields, not the SDK's complete message schema. */
export function presentMessage(message: SDKMessage): MessageView {
  if (message.type === 'result') {
    const ok = message.subtype === 'success' && !message.is_error;
    const text = message.subtype === 'success' ? message.result : message.errors.join('\n');
    return {
      type: message.type,
      subtype: message.subtype,
      text,
      final: { ok, text },
      envelope: {
        type: message.type,
        subtype: message.subtype,
        is_error: message.is_error,
        ...(message.subtype === 'success'
          ? { result: message.result }
          : { errors: message.errors }),
      },
    };
  }
  const data = message as unknown as Record<string, unknown>;
  const body = record(data.message) ? data.message : {};
  const content = Array.isArray(body.content) ? body.content : [];
  type Block =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: unknown }
    | { type: 'tool_result'; content: string };
  const selected = content.filter(record).flatMap<Block>((block) => {
    if (block.type === 'text' && typeof block.text === 'string')
      return [{ type: 'text', text: block.text }];
    if (block.type === 'tool_use')
      return [{ type: 'tool_use', name: String(block.name), input: block.input }];
    if (block.type === 'tool_result')
      return [
        {
          type: 'tool_result',
          content: typeof block.content === 'string' ? block.content : '[tool result blocks]',
        },
      ];
    return [];
  });
  const tool = content.find(
    (block): block is Record<string, unknown> => record(block) && block.type === 'tool_use',
  );
  const text =
    typeof body.content === 'string'
      ? body.content
      : selected
          .map((block) =>
            'text' in block
              ? block.text
              : 'name' in block
                ? `Tool request: ${block.name}`
                : block.content,
          )
          .join('\n');
  const subtype = typeof data.subtype === 'string' ? data.subtype : undefined;
  return {
    type: message.type,
    ...(subtype ? { subtype } : {}),
    text:
      text ||
      (subtype === 'init'
        ? 'The runtime initialized the session.'
        : `Runtime event: ${subtype ?? message.type}`),
    ...(tool ? { toolName: String(tool.name) } : {}),
    envelope: {
      type: message.type,
      ...(subtype ? { subtype } : {}),
      ...(selected.length ? { message: { content: selected } } : {}),
    },
  };
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'The query could not finish.';
  return message.replace(/sk-ant-[\w-]+/g, '[redacted]').slice(0, 500);
}
