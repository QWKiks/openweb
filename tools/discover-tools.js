export class DiscoverToolsTool {
  get name() { return "discover_tools"; }
  async execute(args) {
    return "This tool returns MCP schemas and is intercepted by the MCP server. Ensure you are communicating over MCP.";
  }
}
