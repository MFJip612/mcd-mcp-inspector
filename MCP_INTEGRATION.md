# MCP Integration

## Official server

- Endpoint: `https://mcp.mcd.cn`
- Transport: MCP Streamable HTTP
- Authentication: `Authorization: Bearer <token>`
- Token source: `MCD_MCP_TOKEN` environment variable

These values follow the [official MCP usage guide](https://github.com/M-China/mcd-mcp-server) and [MCP documentation](https://open.mcd.cn/mcp/doc). The official guide documents a limit of 600 requests per token per minute and HTTP 401/429 errors. This tool makes a small, sequential set of requests.

## Diagnostic call flow

1. `initialize` negotiates the MCP protocol and identifies this client as `mcd-mcp-inspector`.
2. `notifications/initialized` completes the handshake.
3. `tools/list` discovers the available tools and follows pagination cursors.
4. The inspector calls only these four names, sequentially, and only if they appear in `tools/list`:

   | Tool | Arguments | Diagnostic purpose |
   | --- | --- | --- |
   | `now-time-info` | `{}` | Confirms a basic read response. |
   | `list-nutrition-foods` | `{}` | Checks response shape and counts records only when a JSON record array is identifiable. |
   | `campaign-calendar` | `{}` | Checks the current-month activity calendar response. |
   | `query-my-account` | `{}` | Checks access and response status while hiding all returned account data. |

No other `tools/call` request is possible through `McpClient.callTool`. Discovering a tool with a write-capable name does not execute it. The utility never creates/cancels orders, claims coupons, draws a lottery, spends points, pays, or books an event.

## Output and privacy

- The terminal shows connectivity, tool count, each smoke-test status, average tool-call latency, nutrition record count and score.
- `report.html` is a self-contained local file with Raw, Normalized and Issues Found sections.
- Account raw/structured values are discarded from the report path. The report includes only status and generic shape metadata for `query-my-account`.
- Safe-tool text previews are truncated and the exact token string is redacted before rendering. All rendered values are HTML-escaped.
- No token, account response, or remote payload is logged to the terminal.

## Verified limits

The repository contains offline tests for the allowlist, request envelope, nutrition count extraction, score, HTML escaping and account-data redaction. These tests do not replace an online run with a user-issued token. The official server's current response shape and live connectivity must be confirmed by running the CLI with that token.

