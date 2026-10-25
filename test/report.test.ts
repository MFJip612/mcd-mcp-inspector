import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHealthScore, renderReportHtml } from '../src/report.ts';

test('scores a complete diagnostic as 100 and keeps failed smoke tests visible', () => {
  const complete = calculateHealthScore({ initialized: true, toolsDiscovered: true, smokeTestsPassed: 4, smokeTestsTotal: 4 });
  const partial = calculateHealthScore({ initialized: true, toolsDiscovered: true, smokeTestsPassed: 2, smokeTestsTotal: 4 });

  assert.equal(complete, 100);
  assert.equal(partial, 75);
});

test('renders required report sections and escapes untrusted response text', () => {
  const html = renderReportHtml({
    generatedAt: '2026-10-25T00:00:00.000Z',
    endpoint: 'https://mcp.mcd.cn',
    initialized: true,
    tools: ['now-time-info', 'list-nutrition-foods'],
    smokeTests: [{
      name: 'list-nutrition-foods',
      ok: true,
      durationMs: 100,
      summary: '2 records',
      raw: '<img src=x onerror=alert(1)>',
      normalized: { nutritionRecords: 2 },
      issues: []
    }],
    nutritionRecords: 2,
    issues: []
  });

  for (const required of ['MCP Health Score', 'Tools Discovered', 'Smoke Tests', 'Average Latency', 'Nutrition Records', 'Raw', 'Normalized', 'Issues Found']) {
    assert.ok(html.includes(required), `missing ${required}`);
  }
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
});

test('never includes raw account data in the report', () => {
  const html = renderReportHtml({
    generatedAt: '2026-10-25T00:00:00.000Z',
    endpoint: 'https://mcp.mcd.cn',
    initialized: true,
    tools: ['query-my-account'],
    smokeTests: [{
      name: 'query-my-account',
      ok: true,
      durationMs: 50,
      summary: 'Account query succeeded; details omitted for privacy',
      raw: 'member-name: private-person',
      normalized: { status: 'available' },
      issues: [],
      sensitive: true
    }],
    nutritionRecords: null,
    issues: []
  });

  assert.ok(!html.includes('private-person'));
  assert.ok(html.includes('redacted'));
});
