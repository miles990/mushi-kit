/**
 * myelin — MCP Server
 *
 * Exposes myelin's crystallization engine as an MCP (Model Context Protocol) server.
 * Runs standalone over stdio transport.
 *
 * Tools: myelin_check, myelin_record, myelin_crystallize, myelin_stats, myelin_rules
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';

import { findMatchingRule, loadRules, saveRules, generateRuleId } from './rules.ts';
import { logDecision, readDecisionLog } from './telemetry.ts';
import { findCandidates, candidateToRule } from './crystallizer.ts';
import type { Rule, TriageEvent } from './types.ts';

const DEFAULT_RULES_PATH = './myelin-rules.json';
const DEFAULT_LOG_PATH = './myelin-decisions.jsonl';

export interface McpServerOptions {
  rulesPath?: string;
  logPath?: string;
}

export function createMcpServer(opts: McpServerOptions = {}) {
  const rulesPath = resolve(opts.rulesPath ?? DEFAULT_RULES_PATH);
  const logPath = resolve(opts.logPath ?? DEFAULT_LOG_PATH);

  const server = new McpServer(
    { name: 'myelin', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // --- myelin_check ---
  server.tool(
    'myelin_check',
    'Check if a rule matches an event (instant, 0 tokens)',
    {
      event: z.object({
        type: z.string(),
        source: z.string().optional(),
        context: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async ({ event }) => {
      const rules = loadRules(rulesPath);
      const triageEvent: TriageEvent = {
        type: event.type,
        source: event.source,
        context: event.context as Record<string, unknown> | undefined,
      };
      const matched = findMatchingRule<string>(triageEvent, rules);

      if (matched) {
        // Increment hit count and save
        matched.hitCount++;
        saveRules(rulesPath, rules);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                hit: true,
                action: matched.action,
                reason: matched.reason,
                ruleId: matched.id,
              }),
            },
          ],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ hit: false }) }],
      };
    },
  );

  // --- myelin_record ---
  server.tool(
    'myelin_record',
    'Record an LLM decision for future crystallization',
    {
      event: z.object({
        type: z.string(),
        source: z.string().optional(),
        context: z.record(z.string(), z.unknown()).optional(),
      }),
      action: z.string(),
      reason: z.string(),
      latencyMs: z.number().optional(),
    },
    async ({ event, action, reason, latencyMs }) => {
      const triageEvent: TriageEvent = {
        type: event.type,
        source: event.source,
        context: event.context as Record<string, unknown> | undefined,
      };
      logDecision(logPath, triageEvent, action, reason, 'llm', latencyMs ?? 0);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ recorded: true }) }],
      };
    },
  );

  // --- myelin_crystallize ---
  server.tool(
    'myelin_crystallize',
    'Find stable patterns and crystallize them into rules',
    {
      minOccurrences: z.number().optional(),
      minConsistency: z.number().optional(),
      autoApply: z.boolean().optional(),
    },
    async ({ minOccurrences, minConsistency, autoApply }) => {
      const logs = readDecisionLog(logPath);
      const candidates = findCandidates(logs, {
        minOccurrences: minOccurrences ?? 10,
        minConsistency: minConsistency ?? 0.95,
      });

      const newRules: Rule<string>[] = [];
      if (autoApply && candidates.length > 0) {
        const rules = loadRules(rulesPath) as Rule<string>[];
        for (const candidate of candidates) {
          const rule = candidateToRule(candidate);
          rules.push(rule);
          newRules.push(rule);
        }
        saveRules(rulesPath, rules);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ candidates, newRules }),
          },
        ],
      };
    },
  );

  // --- myelin_stats ---
  server.tool(
    'myelin_stats',
    'Get current myelin statistics',
    {},
    async () => {
      const rules = loadRules(rulesPath);
      const logs = readDecisionLog(logPath);

      const totalDecisions = logs.length;
      const ruleDecisions = logs.filter((l) => l.method === 'rule').length;
      const llmDecisions = logs.filter((l) => l.method === 'llm').length;
      const errorDecisions = logs.filter((l) => l.method === 'error').length;

      const ruleLatencies = logs.filter((l) => l.method === 'rule').map((l) => l.latencyMs);
      const llmLatencies = logs.filter((l) => l.method === 'llm').map((l) => l.latencyMs);

      const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

      const stats = {
        ruleCount: rules.length,
        totalHitCount: rules.reduce((sum, r) => sum + r.hitCount, 0),
        totalDecisions,
        ruleDecisions,
        llmDecisions,
        errorDecisions,
        ruleCoverage: totalDecisions > 0 ? (ruleDecisions / totalDecisions) * 100 : 0,
        avgRuleLatencyMs: avg(ruleLatencies),
        avgLlmLatencyMs: avg(llmLatencies),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(stats) }],
      };
    },
  );

  // --- myelin_rules ---
  server.tool(
    'myelin_rules',
    'List/manage crystallized rules',
    {
      action: z.enum(['list', 'add', 'remove']),
      rule: z
        .object({
          match: z.object({
            type: z.string().optional(),
            source: z.string().optional(),
            context: z.record(z.string(), z.unknown()).optional(),
          }),
          action: z.string(),
          reason: z.string(),
        })
        .optional(),
      id: z.string().optional(),
    },
    async ({ action, rule, id }) => {
      const rules = loadRules(rulesPath);

      if (action === 'list') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ rules }) }],
        };
      }

      if (action === 'add') {
        if (!rule) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'rule is required for add action' }) }],
            isError: true,
          };
        }
        const newRule: Rule = {
          id: generateRuleId(),
          match: rule.match as Rule['match'],
          action: rule.action as Rule['action'],
          reason: rule.reason,
          createdAt: new Date().toISOString(),
          hitCount: 0,
        };
        rules.push(newRule);
        saveRules(rulesPath, rules);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ added: newRule }) }],
        };
      }

      if (action === 'remove') {
        if (!id) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'id is required for remove action' }) }],
            isError: true,
          };
        }
        const idx = rules.findIndex((r) => r.id === id);
        if (idx === -1) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `rule ${id} not found` }) }],
            isError: true,
          };
        }
        const removed = rules.splice(idx, 1)[0];
        saveRules(rulesPath, rules);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ removed }) }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'unknown action' }) }],
        isError: true,
      };
    },
  );

  return server;
}

/** Start the MCP server on stdio */
export async function startMcpServer(opts: McpServerOptions = {}): Promise<void> {
  const server = createMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Allow direct execution
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('mcp-server.ts') ||
  process.argv[1].endsWith('mcp-server.js')
);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const rulesPath = getFlagValue(args, '--rules-path');
  const logPath = getFlagValue(args, '--log-path');
  startMcpServer({ rulesPath: rulesPath ?? undefined, logPath: logPath ?? undefined });
}

function getFlagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}
