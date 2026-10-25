import test from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, READ_ONLY_SMOKE_TOOLS } from '../src/mcp-client.ts';

test('only allows the four explicitly approved read-only smoke-test tools', async () => {
  let requests = 0;
  const client = new McpClient('test-token', {
    fetchImpl: async () => {
      requests += 1;
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  assert.deepEqual(READ_ONLY_SMOKE_TOOLS, [
    'now-time-info',
    'list-nutrition-foods',
    'campaign-calendar',
    'query-my-account'
  ]);
  await assert.rejects(client.callTool('create-order'), /not allowlisted/i);
  assert.equal(requests, 0);
});

test('sends the official Bearer header and MCP JSON-RPC request envelope', async () => {
  let captured: RequestInit | undefined;
  const client = new McpClient('secret-token', {
    fetchImpl: async (_input, init) => {
      captured = init;
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await client.callTool('now-time-info');
  assert.equal(new Headers(captured?.headers).get('authorization'), 'Bearer secret-token');
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'now-time-info', arguments: {} }
  });
});

test('sends the negotiated protocol version on stateless requests after initialize', async () => {
  const headersSeen: Headers[] = [];
  const client = new McpClient('test-token', {
    fetchImpl: async (_input, init) => {
      const headers = new Headers(init?.headers);
      headersSeen.push(headers);
      const body = JSON.parse(String(init?.body));
      if (body.method === 'initialize') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await client.initialize();
  await client.callTool('now-time-info');
  assert.equal(headersSeen[2].get('mcp-protocol-version'), '2025-03-26');
});
