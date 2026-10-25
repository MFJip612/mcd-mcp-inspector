---
name: mcd-mcp-inspector
description: Run a read-only connection and response-shape health check against McDonald's China MCP server.
---

# McD MCP Inspector Skill

Use this utility when a developer wants to verify that their McDonald's China MCP connection and selected read tools work.

## Safety rules

- Require the user's token through the `MCD_MCP_TOKEN` environment variable. Never request that it be pasted into chat, a command argument, a source file, or a report.
- Only connect to `https://mcp.mcd.cn`.
- Run `initialize`, `tools/list`, then the four allowlisted read-only smoke tests: `now-time-info`, `list-nutrition-foods`, `campaign-calendar`, `query-my-account`.
- Never invoke any other tool. In particular, never call order, cancellation, coupon-claim, lottery, purchase, payment, points-redemption, or booking tools.
- Run tools sequentially and do not retry automatically after authentication or rate-limit errors.
- Do not display or save raw `query-my-account` output. Report only its success/failure and generic response-shape metadata.
- Do not claim that data is complete, current, or valid beyond the checks actually run.

## Run

From the project directory, execute `node --experimental-strip-types src/index.ts` with `MCD_MCP_TOKEN` already set in the process environment. The program prints a short diagnosis and writes `report.html` in the current directory.

For a no-network presentation, run `node --experimental-strip-types src/demo.ts`. The generated report is fictional sample data and must not be described as a live MCP check.
