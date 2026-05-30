/**
 * Runtime i18n module
 * Supports language switching without reloading the extension.
 * Falls back to Chrome's built-in i18n for the default locale.
 *
 * Available locales are auto-detected from _locales/ directories.
 * Language preference is stored in chrome.storage.local.
 */

const STORAGE_KEY = "webbridge_language";

const localeCache = new Map();

const AVAILABLE_LOCALES = ["en", "ru", "zh_CN"];

const LOCALE_NAMES = {
  en: "English",
  ru: "Русский",
  zh_CN: "简体中文",
};

let currentLocale = null;
let _dict = {};
let _en = {};

function detectSystemLocale() {
  const lang = navigator.language || "en";
  const code = lang.replace("-", "_");

  if (AVAILABLE_LOCALES.includes(code)) return code;

  const prefix = lang.split("-")[0];
  const match = AVAILABLE_LOCALES.find(l => l.startsWith(prefix));
  return match || "en";
}

function getEffectiveLocale() {
  return currentLocale || detectSystemLocale();
}

async function loadLocale(locale) {
  if (localeCache.has(locale)) return localeCache.get(locale);

  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const resp = await fetch(url);
    const data = await resp.json();
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
 * Synchronous localized string getter.
 * Call after init() has preloaded both the active locale and English fallback.
 * @param {string} key
 * @param {string[]} [subs]
 * @returns {string}
 */
function t(key, subs) {
  let text = _dict[key] ?? _en[key] ?? key;
  if (subs && Array.isArray(subs)) {
    subs.forEach((sub, i) => {
      text = text.replace(`$${i + 1}$`, sub);
    });
  }
  return text;
}

async function getMessage(key, substitutions) {
  const locale = getEffectiveLocale();
  const messages = await loadLocale(locale);

  let text = messages[key];
  if (text === undefined) {
    const enMessages = await loadLocale("en");
    text = enMessages[key];
  }
  if (text === undefined) {
    text = chrome.i18n.getMessage(key);
  }

  if (substitutions && Array.isArray(substitutions)) {
    substitutions.forEach((sub, i) => {
      text = text.replace(`$${i + 1}$`, sub);
    });
  }

  return text || key;
}

async function getLanguage() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch {
    return null;
  }
}

async function setLanguage(locale) {
  currentLocale = locale;
  if (locale === null) {
    await chrome.storage.local.remove(STORAGE_KEY);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: locale });
  }
  // Refresh dictionaries
  _dict = await loadLocale(getEffectiveLocale());
  _en = await loadLocale("en");
}

async function init() {
  const saved = await getLanguage();
  currentLocale = saved;
  _dict = await loadLocale(getEffectiveLocale());
  _en = await loadLocale("en");
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
  t,
};
