import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNutritionRecordCount, runDiagnostics } from '../src/diagnostics.ts';
import { McpClient, READ_ONLY_SMOKE_TOOLS } from '../src/mcp-client.ts';

test('counts nutrition records from JSON text in MCP content', () => {
  const result = {
    content: [{ type: 'text', text: JSON.stringify({ foods: [{ name: 'A' }, { name: 'B' }] }) }]
  };

  assert.equal(extractNutritionRecordCount(result), 2);
});

test('does not invent a nutrition count for an unknown response shape', () => {
  assert.equal(extractNutritionRecordCount({ content: [{ type: 'text', text: 'OK' }] }), null);
});

test('reads the declared record count from McDonald\'s nutrition text format', () => {
  const payload = { success: true, data: '[160]{productName,energyKcal}:\n  Sample item,210' };
  const result = { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  assert.equal(extractNutritionRecordCount(result), 160);
});

test('runs only the allowlisted calls and hides account error details', async () => {
  const calledTools: string[] = [];
  const client = new McpClient('test-token', {
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === 'initialize') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2025-03-26' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (request.method === 'tools/list') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: { tools: READ_ONLY_SMOKE_TOOLS.map((name) => ({ name })) }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      const name = request.params.name as string;
      calledTools.push(name);
      if (name === 'query-my-account') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          error: { code: -1, message: 'private-account-details-should-not-leak' }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const text = name === 'list-nutrition-foods'
        ? JSON.stringify({ foods: [{ name: 'Sample item' }] })
        : 'Read-only response';
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id: request.id,
        result: { content: [{ type: 'text', text }] }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  const report = await runDiagnostics('test-token', { client });
  assert.deepEqual(calledTools, [...READ_ONLY_SMOKE_TOOLS]);
  assert.ok(!JSON.stringify(report).includes('private-account-details-should-not-leak'));
  assert.equal(report.smokeTests[3].summary, 'Account query failed; details hidden for privacy.');
});

