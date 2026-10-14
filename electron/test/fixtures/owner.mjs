// A separate owner process for owner-death tests: the compiled ManagedService, exactly as Electron main uses it.
import { ManagedService } from '../../dist/lifecycle.js';

const [python, entryPoint, workspace, port, timeoutMs] = process.argv.slice(2);
const service = new ManagedService({ python, entryPoint, workspace, port: Number(port), timeoutMs: Number(timeoutMs), env: process.env });
service.start().then(
  (handle) => process.stdout.write(`${JSON.stringify({ ready: handle.pid })}\n`),
  (error) => process.stdout.write(`${JSON.stringify({ error: error.code })}\n`),
);
setInterval(() => undefined, 60_000);   // stay alive until the test kills this owner
