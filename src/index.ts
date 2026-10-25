import { runDiagnostics } from './diagnostics.ts';
import { calculateHealthScore, writeReport } from './report.ts';
import { READ_ONLY_SMOKE_TOOLS } from './mcp-client.ts';

const token = process.env.MCD_MCP_TOKEN?.trim();
if (!token) {
  console.error('MCD_MCP_TOKEN is required. Set it in your environment; do not pass it as a command-line argument.');
  process.exitCode = 1;
} else {
  try {
    const report = await runDiagnostics(token);
    const passed = report.smokeTests.filter((item) => item.ok).length;
    const score = calculateHealthScore({
      initialized: report.initialized,
      toolsDiscovered: report.toolsListMs !== undefined,
      smokeTestsPassed: passed,
      smokeTestsTotal: report.smokeTests.length
    });
    const path = await writeReport(report);

    console.log('\nMcD MCP Inspector — read-only diagnostics\n');
    console.log(`${report.initialized ? '✓' : '✗'} MCP handshake${report.initializationMs === undefined ? '' : ` (${report.initializationMs.toFixed(1)} ms)`}`);
    console.log(`${report.toolsListMs === undefined ? '✗' : '✓'} tools/list: ${report.tools.length} tools discovered`);
    for (const name of READ_ONLY_SMOKE_TOOLS) {
      const check = report.smokeTests.find((item) => item.name === name);
      console.log(`${check?.ok ? '✓' : '✗'} ${name}: ${check?.summary ?? 'not run'}`);
    }
    const latencies = report.smokeTests.filter((item) => item.durationMs > 0).map((item) => item.durationMs);
    const average = latencies.length ? `${(latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(1)} ms` : '—';
    console.log(`\nMCP Health Score: ${score}/100`);
    console.log(`Average Latency: ${average}`);
    console.log(`Nutrition Records: ${report.nutritionRecords ?? 'not detected'}`);
    if (report.issues.length) {
      console.log('\nIssues Found:');
      for (const issue of report.issues) console.log(`- ${issue}`);
    }
    console.log(`\nHTML report: ${path}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected diagnostic failure';
    console.error(`Diagnostic failed: ${message.slice(0, 240)}`);
    process.exitCode = 1;
  }
}
