import { performance } from 'node:perf_hooks';
import { McpClient, MCP_ENDPOINT, READ_ONLY_SMOKE_TOOLS } from './mcp-client.ts';
import type { DiagnosticReport, McpToolResult, SmokeTest } from './types.ts';

const SENSITIVE_TOOL = 'query-my-account';
const RAW_PREVIEW_LIMIT = 1_200;
const RECORD_KEYS = ['foods', 'nutritionfoods', 'items', 'records', 'foodlist', 'nutritionlist', 'data', 'list', 'results'];

export interface RunOptions {
  client?: McpClient;
  endpoint?: string;
  now?: () => Date;
}

export function extractNutritionRecordCount(result: unknown): number | null {
  const candidates: unknown[] = [];
  if (isObject(result) && result.structuredContent !== undefined) candidates.push(result.structuredContent);

  if (isObject(result) && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!isObject(block) || typeof block.text !== 'string') continue;
      try {
        candidates.push(JSON.parse(block.text));
      } catch {
        // The official tool can return text formats. We report unknown rather than guessing.
      }
    }
  }

  for (const candidate of candidates) {
    const count = findRecordCount(candidate);
    if (count !== null) return count;
  }
  return null;
}

export async function runDiagnostics(token: string, options: RunOptions = {}): Promise<DiagnosticReport> {
  const endpoint = options.endpoint ?? MCP_ENDPOINT;
  const client = options.client ?? new McpClient(token, { endpoint });
  const now = options.now ?? (() => new Date());
  const report: DiagnosticReport = {
    generatedAt: now().toISOString(),
    endpoint,
    initialized: false,
    tools: [],
    smokeTests: [],
    nutritionRecords: null,
    issues: []
  };

  const initStarted = performance.now();
  try {
    await client.initialize();
    report.initialized = true;
    report.initializationMs = elapsed(initStarted);
  } catch (error) {
    report.initializationMs = elapsed(initStarted);
    report.issues.push(`MCP handshake failed: ${safeMessage(error)}`);
    return report;
  }

  const listStarted = performance.now();
  try {
    const tools = await client.listTools();
    report.tools = tools.map((tool) => tool.name);
    report.toolsListMs = elapsed(listStarted);
  } catch (error) {
    report.toolsListMs = elapsed(listStarted);
    report.issues.push(`Tool discovery failed: ${safeMessage(error)}`);
    return report;
  }

  for (const name of READ_ONLY_SMOKE_TOOLS) {
    const started = performance.now();
    const isSensitive = name === SENSITIVE_TOOL;
    const found = report.tools.includes(name);
    if (!found) {
      report.smokeTests.push({
        name,
        ok: false,
        durationMs: 0,
        summary: 'Tool was not advertised by tools/list; no call was made.',
        raw: '',
        normalized: {},
        issues: ['Required read-only tool was not discovered.'],
        sensitive: isSensitive
      });
      continue;
    }

    try {
      const result = await client.callTool(name);
      const durationMs = elapsed(started);
      const issues = result.isError ? ['MCP tool result marked isError=true.'] : [];
      const nutritionRecords = name === 'list-nutrition-foods' ? extractNutritionRecordCount(result) : null;
      if (name === 'list-nutrition-foods') report.nutritionRecords = nutritionRecords;
      const normalized = normalizeResult(result, nutritionRecords, isSensitive);
      const raw = isSensitive ? '' : redact(rawText(result).slice(0, RAW_PREVIEW_LIMIT), token);
      const summary = summaryFor(name, nutritionRecords, result.isError === true);
      const smokeTest: SmokeTest = {
        name,
        ok: !result.isError,
        durationMs,
        summary,
        raw,
        normalized,
        issues,
        sensitive: isSensitive
      };
      report.smokeTests.push(smokeTest);
    } catch (error) {
      const message = isSensitive
        ? 'Account query failed; details hidden for privacy.'
        : safeMessage(error, token);
      report.smokeTests.push({
        name,
        ok: false,
        durationMs: elapsed(started),
        summary: message,
        raw: '',
        normalized: { error: message },
        issues: [message],
        sensitive: isSensitive
      });
    }
  }

  report.issues.push(...report.smokeTests.flatMap((smokeTest) => smokeTest.issues.map((issue) => `${smokeTest.name}: ${issue}`)));
  if (report.nutritionRecords === null) {
    report.issues.push('Nutrition record count could not be derived from the response format.');
  }
  return report;
}

function normalizeResult(result: McpToolResult, nutritionRecords: number | null, sensitive: boolean): Record<string, unknown> {
  const content = Array.isArray(result.content) ? result.content : [];
  const structured = isObject(result.structuredContent) ? result.structuredContent : undefined;
  const normalized: Record<string, unknown> = {
    contentBlockCount: content.length,
    contentTypes: content.map((block) => isObject(block) && typeof block.type === 'string' ? block.type : 'unknown'),
    isError: result.isError === true
  };

  if (structured) normalized.structuredFields = Object.keys(structured);
  if (nutritionRecords !== null) normalized.nutritionRecords = nutritionRecords;
  if (sensitive) normalized.payload = 'redacted for privacy';
  return normalized;
}

function findRecordCount(value: unknown, depth = 0): number | null {
  if (depth > 5) return null;
  if (typeof value === 'string') {
    const header = /^\s*\[(\d+)\]\s*\{[^}\r\n]+\}\s*:/m.exec(value);
    if (header) {
      const count = Number(header[1]);
      return Number.isSafeInteger(count) ? count : null;
    }
    return null;
  }
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => isObject(item)) ? value.length : null;
  }
  if (!isObject(value)) return null;

  for (const key of Object.keys(value)) {
    if (RECORD_KEYS.includes(key.toLowerCase())) {
      const direct = value[key];
      if (Array.isArray(direct) && direct.every((item) => isObject(item))) return direct.length;
    }
  }
  for (const child of Object.values(value)) {
    const nested = findRecordCount(child, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

function rawText(result: McpToolResult): string {
  if (Array.isArray(result.content)) {
    const text = result.content
      .filter((block) => isObject(block) && block.type === 'text' && typeof block.text === 'string')
      .map((block) => String(block.text))
      .join('\n');
    if (text) return text;
  }
  return result.structuredContent === undefined ? '' : JSON.stringify(result.structuredContent, null, 2);
}

function summaryFor(name: string, nutritionRecords: number | null, isError: boolean): string {
  if (isError) return 'The MCP server marked this tool result as an error.';
  if (name === SENSITIVE_TOOL) return 'Account query responded; personal details are hidden.';
  if (name === 'list-nutrition-foods') {
    return nutritionRecords === null ? 'Responded; record count could not be derived.' : `${nutritionRecords} nutrition records detected.`;
  }
  return 'Read-only tool responded; payload is summarized below.';
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redact(value: string, token: string): string {
  return token ? value.split(token).join('[REDACTED TOKEN]') : value;
}

function safeMessage(error: unknown, token = ''): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redact(raw, token).slice(0, 240);
}

