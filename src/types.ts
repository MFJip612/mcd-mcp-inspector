export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  isError?: boolean;
  content?: McpContentBlock[];
  structuredContent?: unknown;
  [key: string]: unknown;
}

export interface SmokeTest {
  name: string;
  ok: boolean;
  durationMs: number;
  summary: string;
  raw: string;
  normalized: Record<string, unknown>;
  issues: string[];
  sensitive?: boolean;
}

export interface DiagnosticReport {
  generatedAt: string;
  endpoint: string;
  initialized: boolean;
  initializationMs?: number;
  toolsListMs?: number;
  tools: string[];
  smokeTests: SmokeTest[];
  nutritionRecords: number | null;
  issues: string[];
}

