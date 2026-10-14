// web/src/zod.ts — the only zod import in src/ (contract §1.3). Jitless before any schema exists, because the CSP blocks new Function.
import { z } from 'zod';
z.config({ jitless: true });
export { z };
