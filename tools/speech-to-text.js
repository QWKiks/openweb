export class SpeechToTextTool {
  get name() { return "speech_to_text"; }
  async execute(args) {
    return "This tool runs locally via Python Whisper server and is intercepted by the MCP server.";
  }
}
