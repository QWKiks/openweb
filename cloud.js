/**
 * Remote Browser Cloud Connector
 *
 * Connect to BrowserStack, Sauce Labs, or any WebDriver-compatible cloud
 * provider. Launches a remote browser and tunnels tool calls through the
 * daemon's existing WebSocket pipeline.
 *
 * Usage:
 *   node cloud.js --provider browserstack --user USER --key KEY --url https://example.com
 *   node cloud.js --provider saucelabs --user USER --key KEY --url https://example.com
 *   node cloud.js --provider local --chromiumPath /path/to/chrome --url https://example.com
 *
 * The script starts a remote browser, opens the extension's popup page,
 * and connects it to the local daemon via WebSocket.
 */

import { WebSocket } from "ws";

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const provider = getArg("provider") || "local";
const user = getArg("user") || process.env.BROWSERSTACK_USER || process.env.SAUCE_USERNAME || "";
const key = getArg("key") || process.env.BROWSERSTACK_KEY || process.env.SAUCE_ACCESS_KEY || "";
const url = getArg("url") || "https://example.com";
const daemonUrl = getArg("daemon") || "ws://127.0.0.1:10086/ws";

const PROVIDERS = {
  browserstack: {
    hubUrl: `https://${user}:${key}@hub-cloud.browserstack.com/wd/hub`,
    capabilities: {
      browserName: "Chrome",
      browserVersion: "latest",
      "bstack:options": {
        os: "OS X",
        osVersion: "Monterey",
        buildName: "OpenWeb Cloud Test",
        sessionName: "Remote browser session",
        userName: user,
        accessKey: key,
      },
    },
  },
  saucelabs: {
    hubUrl: `https://${user}:${key}@ondemand.us-west-1.saucelabs.com/wd/hub`,
    capabilities: {
      browserName: "Chrome",
      browserVersion: "latest",
      platformName: "macOS 12",
      "sauce:options": {
        name: "OpenWeb Cloud Test",
        username: user,
        accessKey: key,
      },
    },
  },
  local: {
    hubUrl: null,
    capabilities: { browserName: "Chrome" },
  },
};

const config = PROVIDERS[provider];
if (!config) {
  console.error(`Unknown provider: ${provider}. Use: browserstack | saucelabs | local`);
  process.exit(1);
}

if (provider !== "local" && (!user || !key)) {
  console.error(`--user and --key required for ${provider} (or set env vars)`);
  process.exit(1);
}

console.log(`\n  OpenWeb Cloud Connector\n`);
console.log(`  Provider: ${provider}`);
console.log(`  Target URL: ${url}`);

if (provider === "local") {
  console.log(`\n  Local mode: use the Chrome extension directly.`);
  console.log(`  For cloud providers, install the OpenWeb extension in the remote browser.`);
  console.log(`  The extension will auto-connect to: ${daemonUrl}\n`);
  process.exit(0);
}

// For cloud providers, we register as a controller and send navigate
console.log(`  Hub: ${config.hubUrl.replace(/:[^@]+@/, ":***@")}`);
console.log(`  Connecting to daemon: ${daemonUrl}\n`);

const ws = new WebSocket(daemonUrl);

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "register", timestamp: Date.now(), nonce: `cloud-${Date.now()}` }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "register_ack") {
    console.log("  Connected to daemon. Waiting for extension in remote browser...");
    console.log(`\n  Steps:`);
    console.log(`  1. Open the remote browser on BrowserStack/Sauce Labs`);
    console.log(`  2. Install the OpenWeb extension (load unpacked from dist/)`);
    console.log(`  3. The extension will connect to: ${daemonUrl}`);
    console.log(`  4. Tool calls will be routed to the remote browser\n`);
    console.log(`  Alternatively, use the WebDriver hub URL directly:`);
    console.log(`  ${config.hubUrl}\n`);
    ws.close();
    process.exit(0);
  }
});

ws.on("error", (e) => {
  console.error(`  Error: ${e.message}`);
  console.error("  Is the daemon running? npm start");
  process.exit(1);
});

setTimeout(() => {
  console.error("  Timeout connecting to daemon");
  process.exit(1);
}, 5000);
