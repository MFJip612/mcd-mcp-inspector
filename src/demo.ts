import { fileURLToPath } from 'node:url';
import { runDiagnostics } from './diagnostics.ts';
import { writeReport } from './report.ts';
import { McpClient } from './mcp-client.ts';
import type { DiagnosticReport, McpToolResult } from './types.ts';

// Offline-only sample. This fake client makes no network requests and uses no account data.
const sampleTools = [
  { name: 'now-time-info' },
  { name: 'list-nutrition-foods' },
  { name: 'campaign-calendar' },
  { name: 'query-my-account' }
];

class DemoClient extends McpClient {
  constructor() {
    super('offline-demo-token');
  }

  override async initialize(): Promise<void> {}

  override async listTools() {
    return sampleTools;
  }

  override async callTool(name: string): Promise<McpToolResult> {
    if (name === 'list-nutrition-foods') {
      return { content: [{ type: 'text', text: JSON.stringify({ foods: Array.from({ length: 42 }, (_, index) => ({ name: `Sample food ${index + 1}` })) }) }] };
    }
    if (name === 'query-my-account') {
      return { content: [{ type: 'text', text: 'Sample account response omitted.' }] };
    }
    return { content: [{ type: 'text', text: name === 'now-time-info' ? '2026-10-25 12:00:00' : 'Sample campaign calendar response.' }] };
  }
}

const report: DiagnosticReport = await runDiagnostics('offline-demo-token', {
  client: new DemoClient(),
  now: () => new Date('2026-10-25T04:00:00.000Z')
});
const output = fileURLToPath(new URL('../demo/report.html', import.meta.url));
await writeReport(report, output);
console.log(`Wrote offline sample report: ${output}`);

