import { inspectPackage } from '../server/package-map.js';
const pkg = await inspectPackage();
console.log(`Installed Claude Agent SDK: ${pkg.version}\n`);
console.table(
  pkg.entries.map((entry) => ({
    entry: entry.path,
    runtime: entry.runtime ?? '(type-only)',
    types: entry.types ?? '(none)',
  })),
);
console.log('\nStart with the root entry. Use import type for /sdk-tools.');
