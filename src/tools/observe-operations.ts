import {
  diagnosticDirectory,
  readDiagnostics,
} from '../server/operational-health/index.ts';
import { readWebConfiguration } from '../server/web-configuration/index.ts';

try {
  const config = readWebConfiguration(process.env);
  const summary = await readDiagnostics(
    diagnosticDirectory(config.objectDirectory),
  );
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
} catch {
  process.stderr.write(
    'Incident diagnostics unavailable: history missing, unreadable or invalid.\n',
  );
  process.exitCode = 1;
}
