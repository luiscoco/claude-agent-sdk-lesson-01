import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURE_ROOT = path.join(PROJECT_ROOT, 'fixtures', 'tiny-project');
export const FIXTURE_PATHS = ['README.md', 'package.json', 'src/tasks.ts'] as const;
