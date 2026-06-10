export class TranslateTool {
  get name() { return "translate"; }
  async execute(args) {
    return "This tool runs locally and is intercepted by the MCP server.";
  }
}
