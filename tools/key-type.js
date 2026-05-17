/**
 * Key Type Tool
 * Types text into the focused element using CDP Input.insertText.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

export class KeyTypeTool {
  name = "key_type";

  async execute(args) {
    const text = args.text;
    if (typeof text !== "string") throw new Error("key_type: text is required (string)");

    const tab = await getActiveTab();
    await attach(tab.id);

    await sendCommand("Input.insertText", { text });
    return { success: true, length: text.length };
  }
}
