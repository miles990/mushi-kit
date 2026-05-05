#!/usr/bin/env node
/**
 * myelin — CLI
 *
 * Commands:
 *   myelin serve   — Start the MCP server (stdio transport)
 *   myelin init    — Auto-configure MCP for Claude Code / Cursor
 *   myelin stats   — Print current stats from rules/log files
 */
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { startMcpServer } from "./mcp-server.js";
import { startProxy } from "./proxy.js";
import { loadRules } from "./rules.js";
import { readDecisionLog } from "./telemetry.js";
const DEFAULT_RULES_PATH = './myelin-rules.json';
const DEFAULT_LOG_PATH = './myelin-decisions.jsonl';
function getFlagValue(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    return args[idx + 1];
}
function printUsage() {
    console.log(`
myelin — Crystallize repeated LLM decisions into zero-cost rules

Usage:
  myelin serve [options]   Start the MCP server (stdio)
  myelin proxy [options]   Start the API proxy server
  myelin init              Auto-configure MCP for Claude Code / Cursor
  myelin stats [options]   Print current stats

Proxy options:
  --port <number>          Port to listen on (default: 8100)
  --target <url>           Target LLM API (default: https://api.anthropic.com)
  --api-key <key>          API key to inject (or set ANTHROPIC_API_KEY)
  --shadow                 Shadow mode — log only, no caching (default: true)
  --active                 Active mode — enable response caching
  --min-hits <number>      Consistent hits before caching (default: 3)
  --cache-path <path>      Path to cache file (default: ./myelin-cache.json)
  --payload-log <path>     Payload log base path (daily rotated, default: ./payload.jsonl)

Common options:
  --rules-path <path>      Path to rules JSON file (default: ./myelin-rules.json)
  --log-path <path>        Path to decision log JSONL file (default: ./myelin-decisions.jsonl)
  --help                   Show this help message
`.trim());
}
// --- serve ---
function cmdServe(args) {
    const rulesPath = getFlagValue(args, '--rules-path') ?? undefined;
    const logPath = getFlagValue(args, '--log-path') ?? undefined;
    startMcpServer({ rulesPath, logPath });
}
// --- proxy ---
function cmdProxy(args) {
    const port = parseInt(getFlagValue(args, '--port') ?? '8100', 10);
    const target = getFlagValue(args, '--target') ?? 'https://api.anthropic.com';
    const apiKey = getFlagValue(args, '--api-key') ?? process.env.ANTHROPIC_API_KEY;
    const shadow = !args.includes('--active');
    const minHits = parseInt(getFlagValue(args, '--min-hits') ?? '3', 10);
    const cachePath = getFlagValue(args, '--cache-path') ?? './myelin-cache.json';
    const logPath = getFlagValue(args, '--log-path') ?? './myelin-proxy.jsonl';
    const payloadLogPath = getFlagValue(args, '--payload-log') ?? './payload.jsonl';
    startProxy({ port, target, apiKey, shadow, minHits, cachePath, logPath, payloadLogPath });
}
// --- init ---
function cmdInit() {
    const cwd = process.cwd();
    const mcpConfig = {
        command: 'npx',
        args: ['myelinate', 'serve', '--rules-path', join(cwd, 'myelin-rules.json'), '--log-path', join(cwd, 'myelin-decisions.jsonl')],
    };
    let configured = false;
    // Claude Code: .mcp.json (project-level)
    const claudeMcpPath = join(cwd, '.mcp.json');
    if (existsSync(claudeMcpPath)) {
        try {
            const existing = JSON.parse(readFileSync(claudeMcpPath, 'utf-8'));
            existing.mcpServers = existing.mcpServers ?? {};
            existing.mcpServers.myelin = mcpConfig;
            writeFileSync(claudeMcpPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
            console.log(`  Updated ${claudeMcpPath}`);
            configured = true;
        }
        catch (e) {
            console.error(`  Failed to update ${claudeMcpPath}: ${e}`);
        }
    }
    // Cursor: .cursor/mcp.json
    const cursorDir = join(cwd, '.cursor');
    const cursorMcpPath = join(cursorDir, 'mcp.json');
    if (existsSync(cursorDir)) {
        try {
            let existing = {};
            if (existsSync(cursorMcpPath)) {
                existing = JSON.parse(readFileSync(cursorMcpPath, 'utf-8'));
            }
            existing.mcpServers = existing.mcpServers ?? {};
            existing.mcpServers.myelin = mcpConfig;
            writeFileSync(cursorMcpPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
            console.log(`  Updated ${cursorMcpPath}`);
            configured = true;
        }
        catch (e) {
            console.error(`  Failed to update ${cursorMcpPath}: ${e}`);
        }
    }
    // If neither exists, create .mcp.json for Claude Code
    if (!configured) {
        const newConfig = { mcpServers: { myelin: mcpConfig } };
        writeFileSync(claudeMcpPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8');
        console.log(`  Created ${claudeMcpPath}`);
    }
    // Create empty rules file if not exists
    const rulesFile = join(cwd, 'myelin-rules.json');
    if (!existsSync(rulesFile)) {
        writeFileSync(rulesFile, '[]', 'utf-8');
        console.log(`  Created ${rulesFile}`);
    }
    console.log(`
myelin MCP server configured!

Next steps:
  1. Restart your editor to pick up the MCP config
  2. The myelin tools are now available:
     - myelin_check   — Check if a rule matches (0 tokens)
     - myelin_record  — Record an LLM decision
     - myelin_crystallize — Find & promote stable patterns
     - myelin_stats   — View statistics
     - myelin_rules   — List/add/remove rules
`);
}
// --- stats ---
function cmdStats(args) {
    const rulesPath = resolve(getFlagValue(args, '--rules-path') ?? DEFAULT_RULES_PATH);
    const logPath = resolve(getFlagValue(args, '--log-path') ?? DEFAULT_LOG_PATH);
    const rules = loadRules(rulesPath);
    const logs = readDecisionLog(logPath);
    const totalDecisions = logs.length;
    const ruleDecisions = logs.filter((l) => l.method === 'rule').length;
    const llmDecisions = logs.filter((l) => l.method === 'llm').length;
    const errorDecisions = logs.filter((l) => l.method === 'error').length;
    const avg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const ruleLatencies = logs.filter((l) => l.method === 'rule').map((l) => l.latencyMs);
    const llmLatencies = logs.filter((l) => l.method === 'llm').map((l) => l.latencyMs);
    console.log(`
myelin stats
============
Rules:           ${rules.length}
Total hits:      ${rules.reduce((s, r) => s + r.hitCount, 0)}

Decisions log:   ${logPath}
Total decisions: ${totalDecisions}
  Rule:          ${ruleDecisions}
  LLM:           ${llmDecisions}
  Error:         ${errorDecisions}
Coverage:        ${totalDecisions > 0 ? ((ruleDecisions / totalDecisions) * 100).toFixed(1) : '0.0'}%
Avg rule ms:     ${avg(ruleLatencies).toFixed(1)}
Avg LLM ms:      ${avg(llmLatencies).toFixed(1)}
`.trim());
}
// --- main ---
const args = process.argv.slice(2);
const command = args[0];
if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
}
switch (command) {
    case 'serve':
        cmdServe(args.slice(1));
        break;
    case 'proxy':
        cmdProxy(args.slice(1));
        break;
    case 'init':
        cmdInit();
        break;
    case 'stats':
        cmdStats(args.slice(1));
        break;
    default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
}
//# sourceMappingURL=cli.js.map