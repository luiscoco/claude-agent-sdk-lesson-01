import { readFile } from 'node:fs/promises';
import type { PackageEntry } from '../shared/lesson.js';

/** Inspect the installed package instead of guessing its export map. */
export async function inspectPackage(): Promise<{ version: string; entries: PackageEntry[] }> {
  const manifestUrl = new URL(
    './package.json',
    import.meta.resolve('@anthropic-ai/claude-agent-sdk'),
  );
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')) as {
    version: string;
    exports: Record<string, { default?: string; types?: string }>;
  };
  const descriptions: Record<string, [string, string, string]> = {
    '.': [
      'Root package',
      'The full SDK entry. This sample imports query() here on the Node.js server.',
      "import { query } from '@anthropic-ai/claude-agent-sdk';",
    ],
    './core': [
      'Core entry',
      'A focused entry for bundling and runtime use. It is not a browser-safe replacement for the server.',
      "import { query } from '@anthropic-ai/claude-agent-sdk/core';",
    ],
    './sdk-tools': [
      'Tool types',
      'TypeScript input and output types for built-in tools. This entry has no runtime default export.',
      "import type { FileReadInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';",
    ],
    './browser': [
      'Browser entry',
      'A separate browser-oriented surface. This lab keeps the root SDK and credentials on the server.',
      '// Inspect browser-sdk.d.ts for this separate surface.\n// This web UI talks to our Node.js host over HTTP.',
    ],
  };
  return {
    version: manifest.version,
    entries: Object.entries(manifest.exports).map(([entry, value]) => {
      const known = descriptions[entry];
      return {
        path:
          entry === '.'
            ? '@anthropic-ai/claude-agent-sdk'
            : `@anthropic-ai/claude-agent-sdk${entry.slice(1)}`,
        label: known?.[0] ?? `Additional export: ${entry}`,
        purpose:
          known?.[1] ??
          'Also present in the installed manifest; not needed for this Lesson 1 sample.',
        runtime: value.default ?? null,
        types: value.types ?? null,
        example: known?.[2] ?? '// See the installed package manifest and matching declarations.',
      };
    }),
  };
}
