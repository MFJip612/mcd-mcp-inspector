import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DiagnosticReport, SmokeTest } from './types.ts';

export interface ScoreInput {
  initialized: boolean;
  toolsDiscovered: boolean;
  smokeTestsPassed: number;
  smokeTestsTotal: number;
}

export function calculateHealthScore(input: ScoreInput): number {
  const handshakePoints = input.initialized ? 30 : 0;
  const discoveryPoints = input.toolsDiscovered ? 20 : 0;
  const testRatio = input.smokeTestsTotal > 0
    ? Math.max(0, Math.min(1, input.smokeTestsPassed / input.smokeTestsTotal))
    : 0;
  return Math.round(handshakePoints + discoveryPoints + 50 * testRatio);
}

export function renderReportHtml(report: DiagnosticReport): string {
  const passed = report.smokeTests.filter((item) => item.ok).length;
  const score = calculateHealthScore({
    initialized: report.initialized,
    toolsDiscovered: report.toolsListMs !== undefined,
    smokeTestsPassed: passed,
    smokeTestsTotal: report.smokeTests.length
  });
  const latencies = report.smokeTests.filter((item) => item.durationMs > 0).map((item) => item.durationMs);
  const averageLatency = latencies.length
    ? `${(latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(1)} ms`
    : '—';
  const reportIssues = [...report.issues];
  const scoreTone = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>McD MCP Inspector — Diagnostic Report</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#23211f;background:#f6f3ef;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}body{margin:0;padding:32px 20px 64px}.page{max-width:1040px;margin:0 auto}.topline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:25px}.brand{font-size:14px;font-weight:800;letter-spacing:.02em}.badge{color:#625d57;background:#eae5df;padding:7px 11px;border-radius:999px;font-size:12px}.hero{background:#251f1d;color:#fff;border-radius:24px;padding:30px;display:grid;grid-template-columns:1fr auto;gap:22px;align-items:center;box-shadow:0 16px 50px #261b1718}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:#e8b979;font-weight:800}.hero h1{margin:9px 0 8px;font-size:clamp(25px,4vw,38px);letter-spacing:-.035em}.muted{color:#bcb4ae;font-size:13px}.score{width:126px;height:126px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#${scoreTone === 'good' ? '64c998' : scoreTone === 'warn' ? 'e8ae55' : 'ef7272'} ${score * 3.6}deg,#ffffff18 0);position:relative}.score:before{content:"";position:absolute;inset:9px;border-radius:inherit;background:#251f1d}.score div{position:relative;text-align:center}.score strong{font-size:34px;display:block;line-height:1}.score small{color:#bcb4ae;font-size:11px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin:16px 0 26px}.metric,.panel{background:#fff;border:1px solid #e8e2dc;border-radius:16px;box-shadow:0 7px 24px #261b1708}.metric{padding:17px}.metric span{display:block;color:#77716b;font-size:12px}.metric strong{display:block;font-size:24px;margin-top:9px;letter-spacing:-.03em}.section-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin:27px 1px 11px}.section-head h2{margin:0;font-size:19px;letter-spacing:-.02em}.section-head small{color:#77716b}.panel{overflow:hidden}.test-row{padding:15px 17px;border-top:1px solid #f0ece8;display:grid;grid-template-columns:1fr auto;gap:7px 14px}.test-row:first-child{border-top:0}.tool-name{font-weight:750;font-size:14px}.status{font-size:11px;text-transform:uppercase;font-weight:800;letter-spacing:.08em}.status.ok{color:#19825a}.status.fail{color:#b43737}.test-summary{color:#6d6761;font-size:13px;grid-column:1}.latency{color:#6d6761;font-size:12px;grid-column:2;grid-row:2}.details{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:9px}.detail{min-width:0;background:#f8f6f3;border-radius:10px;padding:10px}.detail h3{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#827b74;margin:0 0 8px}.detail pre{font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:190px;overflow:auto;margin:0;color:#37322e}.empty{color:#908981;font-size:12px;font-style:italic}.issue-list{margin:0;padding:15px 20px 15px 35px;color:#6d5144;font-size:13px}.issue-list li+li{margin-top:7px}.tools{padding:15px 18px;display:flex;flex-wrap:wrap;gap:7px}.tool-chip{font:11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#514b45;background:#f2efeb;padding:6px 9px;border-radius:7px}.foot{margin-top:22px;color:#878078;font-size:11px;line-height:1.7}.foot strong{color:#635d57}.success-note{color:#19825a}.warning-note{color:#99650d}@media(max-width:720px){body{padding:18px 13px 40px}.hero{padding:22px;grid-template-columns:1fr auto}.score{width:94px;height:94px}.score strong{font-size:27px}.metrics{grid-template-columns:repeat(2,1fr)}.details{grid-template-columns:1fr}.topline{align-items:flex-start;flex-direction:column}.metric strong{font-size:21px}}
  </style>
</head>
<body>
  <main class="page">
    <div class="topline"><div class="brand">🍟 McD MCP Inspector</div><div class="badge">Read-only diagnostic · ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</div></div>
    <section class="hero">
      <div><div class="eyebrow">MCP Health Score</div><h1>${score >= 85 ? 'Connection looks healthy' : score >= 60 ? 'A few checks need attention' : 'Setup needs attention'}</h1><div class="muted">${escapeHtml(report.endpoint)} · ${report.initialized ? 'Handshake complete' : 'Handshake failed'}</div></div>
      <div class="score" aria-label="Health score ${score} out of 100"><div><strong>${score}</strong><small> / 100</small></div></div>
    </section>
    <section class="metrics" aria-label="Summary metrics">
      <article class="metric"><span>Tools Discovered</span><strong>${report.tools.length}</strong></article>
      <article class="metric"><span>Smoke Tests</span><strong>${passed}<small style="font-size:13px;color:#817a73"> / ${report.smokeTests.length} passed</small></strong></article>
      <article class="metric"><span>Average Latency</span><strong>${averageLatency}</strong></article>
      <article class="metric"><span>Nutrition Records</span><strong>${report.nutritionRecords === null ? '—' : report.nutritionRecords}</strong></article>
    </section>
    <div class="section-head"><h2>Smoke Tests</h2><small>Only approved read-only tools are called</small></div>
    <section class="panel" aria-label="Smoke test details">
      ${report.smokeTests.length ? report.smokeTests.map(renderSmokeTest).join('') : '<div class="test-row"><span class="test-summary">No smoke tests ran.</span></div>'}
    </section>
    <div class="section-head"><h2>Issues Found</h2><small>${reportIssues.length} item${reportIssues.length === 1 ? '' : 's'}</small></div>
    <section class="panel">${reportIssues.length ? `<ul class="issue-list">${reportIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : '<div class="tools success-note">No issues found in the selected read-only checks.</div>'}</section>
    <div class="section-head"><h2>Tools Discovered</h2><small>${report.tools.length} tool name${report.tools.length === 1 ? '' : 's'}</small></div>
    <section class="panel tools">${report.tools.length ? report.tools.map((tool) => `<span class="tool-chip">${escapeHtml(tool)}</span>`).join('') : '<span class="empty">No tools were discovered.</span>'}</section>
    <footer class="foot"><strong>Privacy:</strong> query-my-account output is not included in this report. The token is never written to the report. Diagnostics are read-only and do not verify ordering, coupon, payment, or other transaction workflows.<br>Unofficial developer utility. Report generated locally at ${escapeHtml(report.generatedAt)}.</footer>
  </main>
</body>
</html>`;
}

export async function writeReport(report: DiagnosticReport, outputPath = 'report.html'): Promise<string> {
  const fullPath = resolve(outputPath);
  await writeFile(fullPath, renderReportHtml(report), 'utf8');
  return fullPath;
}

function renderSmokeTest(item: SmokeTest): string {
  const raw = item.sensitive ? 'redacted to protect account data' : item.raw || 'No raw preview captured.';
  const normalized = JSON.stringify(item.normalized, null, 2);
  const issues = item.issues.length ? item.issues.join('\n') : 'None';
  return `<article class="test-row">
  <div class="tool-name">${escapeHtml(item.name)}</div><div class="status ${item.ok ? 'ok' : 'fail'}">${item.ok ? '✓ Passed' : '✕ Failed'}</div>
  <div class="test-summary">${escapeHtml(item.summary)}</div><div class="latency">${item.durationMs.toFixed(1)} ms</div>
  <div class="details">
    <div class="detail"><h3>Raw</h3><pre>${escapeHtml(raw)}</pre></div>
    <div class="detail"><h3>Normalized</h3><pre>${escapeHtml(normalized)}</pre></div>
    <div class="detail"><h3>Issues Found</h3><pre>${escapeHtml(issues)}</pre></div>
  </div>
</article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] as string);
}

