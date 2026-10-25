import type { McpTool, McpToolResult } from './types.ts';

export const MCP_ENDPOINT = 'https://mcp.mcd.cn';
export const READ_ONLY_SMOKE_TOOLS = [
  'now-time-info',
  'list-nutrition-foods',
  'campaign-calendar',
  'query-my-account'
] as const;

type ReadOnlySmokeTool = typeof READ_ONLY_SMOKE_TOOLS[number];
type FetchFunction = typeof fetch;

interface ClientOptions {
  fetchImpl?: FetchFunction;
  timeoutMs?: number;
  endpoint?: string;
}

interface RpcEnvelope {
  jsonrpc?: string;
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

export class McpClient {
  private readonly token: string;
  private readonly fetchImpl: FetchFunction;
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  private nextId = 1;
  private sessionId?: string;
  private protocolVersion = '2025-03-26';
  private protocolNegotiated = false;

  constructor(token: string, options: ClientOptions = {}) {
    this.token = token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? MCP_ENDPOINT;

    const parsedEndpoint = new URL(this.endpoint);
    if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.hostname !== 'mcp.mcd.cn') {
      throw new Error('The endpoint must be the official HTTPS MCP host: mcp.mcd.cn');
    }
  }

  async initialize(): Promise<void> {
    const response = await this.send('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: 'mcd-mcp-inspector', version: '0.1.0' }
    });

    if (!response.result) throw new Error('MCP initialize returned no result');
    const negotiated = response.result.protocolVersion;
    if (typeof negotiated === 'string') this.protocolVersion = negotiated;
    this.protocolNegotiated = true;

    const notificationHeaders = this.headers();
    const notification = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: notificationHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!notification.ok) throw this.httpError(notification.status);
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const params = cursor ? { cursor } : {};
      const response = await this.send('tools/list', params);
      const listed = response.result?.tools;
      if (!Array.isArray(listed)) throw new Error('tools/list returned an invalid tools field');
      tools.push(...listed.filter((tool): tool is McpTool => Boolean(tool) && typeof tool.name === 'string'));

      const nextCursor = response.result?.nextCursor;
      if (typeof nextCursor !== 'string' || !nextCursor) return tools;
      if (seenCursors.has(nextCursor)) throw new Error('tools/list repeated a pagination cursor');
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    throw new Error('tools/list exceeded the 20-page safety limit');
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!READ_ONLY_SMOKE_TOOLS.includes(name as ReadOnlySmokeTool)) {
      throw new Error(`Tool "${name}" is not allowlisted for read-only diagnostics`);
    }

    const response = await this.send('tools/call', { name, arguments: args });
    if (!response.result) throw new Error(`tools/call returned no result for ${name}`);
    return response.result as McpToolResult;
  }

  private headers(): Headers {
    const headers = new Headers({
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    });
    if (this.sessionId) {
      headers.set('MCP-Session-Id', this.sessionId);
    }
    if (this.protocolNegotiated) headers.set('MCP-Protocol-Version', this.protocolVersion);
    return headers;
  }

  private async send(method: string, params: Record<string, unknown>): Promise<RpcEnvelope> {
    const id = this.nextId++;
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) throw this.httpError(response.status);
    const returnedSession = response.headers.get('MCP-Session-Id');
    if (returnedSession) this.sessionId = returnedSession;

    const envelope = await readRpcEnvelope(response);
    if (envelope.error) {
      throw new Error(`MCP ${method} failed (${envelope.error.code ?? 'unknown'}): ${envelope.error.message ?? 'server error'}`);
    }
    return envelope;
  }

  private httpError(status: number): Error {
    if (status === 401) return new Error('MCP authentication failed (HTTP 401); check the token');
    if (status === 429) return new Error('MCP rate limit reached (HTTP 429); wait before trying again');
    return new Error(`MCP request failed (HTTP ${status})`);
  }
}

async function readRpcEnvelope(response: Response): Promise<RpcEnvelope> {
  const body = await response.text();
  if (!body.trim()) return {};

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream') || body.includes('\ndata:')) {
    const messages = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]');
    for (const message of messages.reverse()) {
      try {
        return JSON.parse(message) as RpcEnvelope;
      } catch {
        // Ignore non-JSON event data and keep looking for the JSON-RPC payload.
      }
    }
    throw new Error('MCP returned an unreadable event stream');
  }

  try {
    return JSON.parse(body) as RpcEnvelope;
  } catch {
    throw new Error('MCP returned an invalid JSON response');
  }
}
