/**
 * Runtime i18n module
 * Supports language switching without reloading the extension.
 * Falls back to Chrome's built-in i18n for the default locale.
 *
 * Available locales are auto-detected from _locales/ directories.
 * Language preference is stored in chrome.storage.local.
 */

const STORAGE_KEY = "webbridge_language";

// Built-in locale data (loaded at build time or fetched on demand)
const localeCache = new Map(); // locale → { key → message }

// Available locales — populated from _locales/
const AVAILABLE_LOCALES = ["en", "ru", "zh_CN"];

const LOCALE_NAMES = {
  en: "English",
  ru: "Русский",
  zh_CN: "简体中文",
};

let currentLocale = null; // null = auto (system)

/**
 * Get the system language from navigator.language.
 * Maps browser language codes to available locales.
 */
function detectSystemLocale() {
  const lang = navigator.language || "en"; // e.g. "ru", "en-US", "zh-CN"
  const code = lang.replace("-", "_");

  // Exact match
  if (AVAILABLE_LOCALES.includes(code)) return code;

  // Prefix match (e.g. "en" matches "en", "zh" matches "zh_CN")
  const prefix = lang.split("-")[0];
  const match = AVAILABLE_LOCALES.find(l => l.startsWith(prefix));
  return match || "en";
}

/**
 * Get the effective locale (resolved from auto → actual).
 */
function getEffectiveLocale() {
  return currentLocale || detectSystemLocale();
}

/**
 * Load locale messages from the extension's _locales/ directory.
 * @param {string} locale
 * @returns {Promise<object>}
 */
async function loadLocale(locale) {
  if (localeCache.has(locale)) return localeCache.get(locale);

  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const resp = await fetch(url);
    const data = await resp.json();
    // Flatten: { key: { message: "..." } } → { key: "..." }
    const flat = {};
    for (const [k, v] of Object.entries(data)) {
      flat[k] = v.message;
    }
    localeCache.set(locale, flat);
    return flat;
  } catch {
    localeCache.set(locale, {});
    return {};
  }
}

/**
 * Get a localized message.
 * Tries the effective locale first, then falls back to English.
 * @param {string} key
 * @param {string[]} [substitutions]
 * @returns {string}
 */
async function getMessage(key, substitutions) {
  const locale = getEffectiveLocale();
  const messages = await loadLocale(locale);

  let text = messages[key];
  if (text === undefined) {
    // Fallback to English
    const enMessages = await loadLocale("en");
    text = enMessages[key];
  }
  if (text === undefined) {
    // Fallback to Chrome's built-in i18n
    text = chrome.i18n.getMessage(key, substitutions);
  }

  // Handle $N$ placeholders
  if (substitutions && Array.isArray(substitutions)) {
    substitutions.forEach((sub, i) => {
      text = text.replace(`$${i + 1}$`, sub);
    });
  }

  return text || key;
}

/**
 * Get the current language setting.
 * @returns {Promise<string|null>} locale code or null for auto
 */
async function getLanguage() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch {
    return null;
  }
}

/**
 * Set the language preference.
 * @param {string|null} locale — locale code or null for auto
 */
async function setLanguage(locale) {
  currentLocale = locale;
  if (locale === null) {
    await chrome.storage.local.remove(STORAGE_KEY);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: locale });
  }
}

/**
 * Initialize i18n: load saved preference and preload locales.
 */
async function init() {
  const saved = await getLanguage();
  currentLocale = saved;
  // Preload the effective locale
  await loadLocale(getEffectiveLocale());
  await loadLocale("en"); // Always preload fallback
}

export {
  getMessage,
  getLanguage,
  setLanguage,
  getEffectiveLocale,
  detectSystemLocale,
  AVAILABLE_LOCALES,
  LOCALE_NAMES,
  init,
};
