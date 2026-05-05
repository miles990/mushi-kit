/**
 * myelin — MCP Server
 *
 * Exposes myelin's crystallization engine as an MCP (Model Context Protocol) server.
 * Runs standalone over stdio transport.
 *
 * Tools: myelin_check, myelin_record, myelin_crystallize, myelin_stats, myelin_rules
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export interface McpServerOptions {
    rulesPath?: string;
    logPath?: string;
}
export declare function createMcpServer(opts?: McpServerOptions): McpServer;
/** Start the MCP server on stdio */
export declare function startMcpServer(opts?: McpServerOptions): Promise<void>;
//# sourceMappingURL=mcp-server.d.ts.map