// Player-facing language (ARCHITECTURE.md §20). The language is fixed for the whole page life: it is
// resolved once when this module first loads (before any UI is built) and changing it reloads the page,
// so tables can be read at module level. New player text goes through t(), never a literal.
import tr from './tr.js';
import en from './en.js';

const TABLES = { tr, en };
const SETTINGS_KEY = 'kk1:settings';

// URL ?lang= (session only) > stored setting 'lang' > browser language. index.html repeats this order
// in a tiny inline script so the boot card speaks the same language before any module loads.
export function resolveLang() {
  if (typeof document === 'undefined') return 'tr'; // Node tooling keeps the source language
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'tr' || q === 'en') return q;
  } catch { /* no location: fall through */ }
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (stored && (stored.lang === 'tr' || stored.lang === 'en')) return stored.lang;
  } catch { /* storage blocked or corrupt: fall through */ }
  try {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    return /^tr\b/i.test(String(langs[0] || '')) ? 'tr' : 'en';
  } catch { /* not a browser */ }
  return 'tr';
}

const current = resolveLang();
const warned = new Set();

export const lang = () => current;

function lookup(key) {
  const v = TABLES[current][key] ?? tr[key];
  if (v === undefined && !warned.has(key)) {
    warned.add(key);
    console.warn('[i18n] missing key', key);
  }
  return v;
}

// t('standings.next', { name }) — `{name}` placeholders; falls back to Turkish, then to the key.
export function t(key, params) {
  const v = lookup(key);
  if (v === undefined) return key;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
}

// Count-dependent text: keys `<key>.one` / `<key>.other`, {n} is filled in.
export const tn = (key, n, params) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params });

export const upper = (s) => String(s).toLocaleUpperCase(current === 'tr' ? 'tr' : 'en');

export function ordinal(n) {
  if (current === 'tr') return `${n}.`;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 < 4 ? n % 10 : 0]}`;
}

export const decimalSep = () => (current === 'tr' ? ',' : '.');
