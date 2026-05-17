/**
 * Send Keys Tool
 * Sends key combinations (e.g. Ctrl+A, Shift+Tab, Enter) via CDP Input events.
 */

import { attach, sendCommand } from "../lib/cdp.js";
import { getActiveTab } from "../lib/tab-manager.js";

// Modifier key definitions
const MODIFIERS = {
  alt:   { bit: 1, key: "Alt",       code: "AltLeft",      vkc: 18 },
  ctrl:  { bit: 2, key: "Control",   code: "ControlLeft",  vkc: 17 },
  control: { bit: 2, key: "Control", code: "ControlLeft",  vkc: 17 },
  cmd:   { bit: 4, key: "Meta",      code: "MetaLeft",     vkc: 91 },
  meta:  { bit: 4, key: "Meta",      code: "MetaLeft",     vkc: 91 },
  shift: { bit: 8, key: "Shift",     code: "ShiftLeft",    vkc: 16 },
};

const SHIFT_BIT = MODIFIERS.shift.bit;

let cachedPlatform = null;

async function getPlatform() {
  if (cachedPlatform === null) {
    cachedPlatform = (await chrome.runtime.getPlatformInfo()).os;
  }
  return cachedPlatform;
}

function getModKey(platform) {
  return platform === "mac" ? MODIFIERS.cmd : MODIFIERS.ctrl;
}

// Special key definitions
const SPECIAL_KEYS = {
  enter:     { key: "Enter",      code: "Enter",      vkc: 13, text: "\r" },
  return:    { key: "Enter",      code: "Enter",      vkc: 13, text: "\r" },
  escape:    { key: "Escape",     code: "Escape",     vkc: 27 },
  esc:       { key: "Escape",     code: "Escape",     vkc: 27 },
  tab:       { key: "Tab",        code: "Tab",        vkc: 9 },
  backspace: { key: "Backspace",  code: "Backspace",  vkc: 8 },
  delete:    { key: "Delete",     code: "Delete",     vkc: 46 },
  space:     { key: " ",          code: "Space",      vkc: 32, text: " " },
  arrowup:   { key: "ArrowUp",    code: "ArrowUp",    vkc: 38 },
  arrowdown: { key: "ArrowDown",  code: "ArrowDown",  vkc: 40 },
  arrowleft: { key: "ArrowLeft",  code: "ArrowLeft",  vkc: 37 },
  arrowright:{ key: "ArrowRight", code: "ArrowRight", vkc: 39 },
  home:      { key: "Home",       code: "Home",       vkc: 36 },
  end:       { key: "End",        code: "End",        vkc: 35 },
  pageup:    { key: "PageUp",     code: "PageUp",     vkc: 33 },
  pagedown:  { key: "PageDown",   code: "PageDown",   vkc: 34 },
};

/**
 * Parse a single key identifier (e.g. "a", "Enter", "F1").
 */
function parseKey(key) {
  const lower = key.toLowerCase();

  if (SPECIAL_KEYS[lower]) return SPECIAL_KEYS[lower];

  // Function keys F1-F12
  const fnMatch = lower.match(/^f(\d{1,2})$/);
  if (fnMatch) {
    const num = parseInt(fnMatch[1], 10);
    if (num >= 1 && num <= 12) return { key: `F${num}`, code: `F${num}`, vkc: 111 + num };
  }

  // Single character
  if (key.length === 1) {
    if (/^[a-zA-Z]$/.test(key)) {
      const lower = key.toLowerCase();
      const upper = key.toUpperCase();
      return { key: lower, code: `Key${upper}`, vkc: upper.charCodeAt(0), text: lower };
    }
    if (/^[0-9]$/.test(key)) {
      return { key, code: `Digit${key}`, vkc: key.charCodeAt(0), text: key };
    }
  }

  throw new Error(
    `send_keys: unknown key "${key}". Supported: ${Object.keys(SPECIAL_KEYS).join(", ")}, F1-F12, single letters/digits.`
  );
}

/**
 * Parse a key segment like "Ctrl+A" or "Shift+Tab".
 */
function parseSegment(segment, modKey) {
  const parts = segment.split("+").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("send_keys: empty segment");

  let modifierBits = 0;
  const modifierKeys = [];

  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts[i].toLowerCase();
    const mod = name === "mod" ? modKey : MODIFIERS[name];
    if (!mod) {
      throw new Error(
        `send_keys: "${parts[i]}" is not a modifier. Use Alt/Ctrl/Cmd/Meta/Shift, or Mod (auto-resolves to Cmd on Mac, Ctrl on Win/Linux).`
      );
    }
    modifierBits |= mod.bit;
    modifierKeys.push(mod);
  }

  const spec = parseKey(parts[parts.length - 1]);
  return { modifierBits, modifierKeys, spec };
}

/**
 * Apply shift uppercase transformation if needed.
 */
function applyShift(keySpec, modifierBits) {
  if (!modifierBits || keySpec.key.length !== 1 || !/^[a-z]$/.test(keySpec.key)) return keySpec;
  const upper = keySpec.key.toUpperCase();
  return { ...keySpec, key: upper, text: upper };
}

export class SendKeysTool {
  name = "send_keys";

  async execute(args) {
    const keys = args.keys;
    if (typeof keys !== "string" || !keys.trim()) {
      throw new Error('send_keys: keys is required (string), e.g. "Enter" or "Mod+A" or "Shift+Tab" or "Enter Escape"');
    }

    const repeat = args.repeat;
    const repeatCount = repeat === undefined ? 1 : Number(repeat);
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 100) {
      throw new Error("send_keys: repeat must be an integer in [1, 100]");
    }

    const platform = await getPlatform();
    const modKey = getModKey(platform);

    const segments = keys.trim().split(/\s+/).map((s) => parseSegment(s, modKey));

    const tab = await getActiveTab();
    await attach(tab.id);

    let dispatched = 0;

    for (let r = 0; r < repeatCount; r++) {
      for (const { modifierBits, modifierKeys, spec } of segments) {
        const keySpec = applyShift(spec, modifierBits & SHIFT_BIT);
        let currentModifiers = 0;

        // Press modifier keys
        for (const mod of modifierKeys) {
          currentModifiers |= mod.bit;
          await sendCommand("Input.dispatchKeyEvent", {
            type: "keyDown",
            modifiers: currentModifiers,
            key: mod.key,
            code: mod.code,
            windowsVirtualKeyCode: mod.vkc,
          });
        }

        // Press the main key
        const textArg = (modifierBits & ~SHIFT_BIT) === 0 && keySpec.text !== undefined
          ? { text: keySpec.text }
          : {};
        await sendCommand("Input.dispatchKeyEvent", {
          type: "keyDown",
          modifiers: modifierBits,
          key: keySpec.key,
          code: keySpec.code,
          windowsVirtualKeyCode: keySpec.vkc,
          ...textArg,
        });

        // Release the main key
        await sendCommand("Input.dispatchKeyEvent", {
          type: "keyUp",
          modifiers: modifierBits,
          key: keySpec.key,
          code: keySpec.code,
          windowsVirtualKeyCode: keySpec.vkc,
        });

        // Release modifier keys in reverse order
        for (let i = modifierKeys.length - 1; i >= 0; i--) {
          const mod = modifierKeys[i];
          currentModifiers &= ~mod.bit;
          await sendCommand("Input.dispatchKeyEvent", {
            type: "keyUp",
            modifiers: currentModifiers,
            key: mod.key,
            code: mod.code,
            windowsVirtualKeyCode: mod.vkc,
          });
        }

        dispatched++;
      }
    }

    return { success: true, dispatched, os: platform };
  }
}
