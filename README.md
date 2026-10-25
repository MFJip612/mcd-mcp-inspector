# McD MCP Inspector

**麦麦 MCP 体检站** — 给麦当劳 MCP 开发者用的一键只读诊断工具。

它会验证官方 MCP 服务能否完成握手、发现工具，并依次 smoke-test 四个明确允许的只读工具；随后在终端显示摘要，并在本机生成单页 HTML 报告。

> 本项目是非官方开发者工具。不会创建或取消订单、领取优惠券、抽奖、扣减积分、支付或预约。`query-my-account` 只检查响应状态和结构，原始会员资料不会写入报告。

## 快速开始

需要 Node.js 22.13 或更新版本；不需要安装 npm 依赖。

PowerShell 中安全输入 Token（输入内容不会回显），运行完可清除当前会话中的环境变量：

```powershell
$secureToken = Read-Host "MCP token" -AsSecureString
$env:MCD_MCP_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
node --experimental-strip-types src/index.ts
Remove-Item Env:MCD_MCP_TOKEN
```

运行后会执行 MCP 握手、`tools/list` 和四个只读 smoke tests，并在当前目录写出 `report.html`。Token 只从 `MCD_MCP_TOKEN` 环境变量读取，不接受命令行参数，也不会写入文件、报告或诊断日志。

也可以用 npm 脚本运行：

```sh
npm start
npm test
```

## 离线演示

无需 Token 或网络连接：

```sh
node --experimental-strip-types src/demo.ts
```

这会将一份明确标记为示例数据的报告写到 `demo/report.html`。仓库内已包含生成好的示例报告，可直接打开查看版式。

## 报告内容

- MCP Health Score（握手 30 分、工具发现 20 分、四项 smoke tests 共 50 分）
- 发现的工具数量、Smoke Tests、平均延迟、Nutrition Records
- 每项测试的 Raw、Normalized、Issues Found
- 账户原始数据一律隐藏；Token 字符串也会从原始预览中移除
- HTML 输出不加载外部脚本、样式或字体，断网也可打开

Nutrition Records 优先统计 JSON 记录数组，也识别麦当劳营养接口返回的 `[数量]{字段}:` 记录头；若格式无法可靠判断会显示“未检测”，不会猜数字。

## 项目结构

```text
.
├── CONTEST_DECLARATION.md       # 官方仓库原样文件
├── MCP_INTEGRATION.md           # Server、工具与调用流程
├── SKILL.md                     # 面向智能体的使用约束
├── mcp-config.example.json      # 仅含环境变量占位符
├── package.json
├── src/
│   ├── mcp-client.ts
│   ├── diagnostics.ts
│   ├── report.ts
│   ├── index.ts
│   └── demo.ts
├── test/
└── demo/report.html
```

## 官方参考

- [麦当劳 MCP 文档](https://open.mcd.cn/mcp/doc)
- [麦当劳 MCP Server 官方接入指南](https://github.com/M-China/mcd-mcp-server)
- [麦当劳程序员创意开发大赛](https://github.com/M-China/mcd-developer-innovation-challenge)
