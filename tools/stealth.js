import { buildStealthScript } from "../lib/stealth.js";
import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

let stealthEnabled = true;
let stealthConfig = {};

export class StealthTool {
  name = "stealth";

  async execute(args) {
    const cmd = args.cmd || "status";

    switch (cmd) {
      case "enable":
        stealthEnabled = true;
        if (args.config) stealthConfig = args.config;
        return { enabled: true, message: "Stealth mode enabled. Patches will apply on next navigation." };

      case "disable":
        stealthEnabled = false;
        return { enabled: false, message: "Stealth mode disabled." };

      case "status":
        return {
          enabled: stealthEnabled,
          config: stealthConfig,
          activePatches: stealthEnabled ? Object.keys(buildStealthPatches()) : [],
        };

      case "configure":
        if (args.config) stealthConfig = args.config;
        return { enabled: stealthEnabled, config: stealthConfig };

      case "inject": {
        if (!stealthEnabled) {
          return { injected: false, message: "Stealth is disabled. Enable it first." };
        }
        const tab = await getActiveTab();
        await attach(tab.id);
        const source = buildStealthScript({ ...stealthConfig, ...args.config });
        try {
          await sendCommand("Page.addScriptToEvaluateOnNewDocument", {
            source,
            world: "MAIN",
          });
        } catch (e) {
          await sendCommand("Page.enable");
          await sendCommand("Page.addScriptToEvaluateOnNewDocument", {
            source,
            world: "MAIN",
          });
        }
        return { injected: true, scriptLength: source.length };
      }

      default:
        throw new Error(`stealth: unknown cmd "${cmd}". Use: enable, disable, status, configure, inject`);
    }
  }
}

function buildStealthPatches() {
  return {
    webdriver: true,
    plugins: true,
    languages: true,
    hardwareConcurrency: true,
    deviceMemory: true,
    webgl: true,
    canvas: true,
    chrome: true,
    platform: true,
  };
}

export function getStealthScript() {
  if (!stealthEnabled) return "";
  return buildStealthScript(stealthConfig);
}

export function isStealthEnabled() {
  return stealthEnabled;
}
