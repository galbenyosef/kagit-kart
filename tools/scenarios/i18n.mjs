// Language scenario against the real game (ARCHITECTURE.md §20). Walks every screen under en-US and
// again under tr-TR. English: no Turkish letters or Turkish-only words in any visible text, aria-label or
// title attribute, and no text element wider than its box. Turkish: no overflow (the copy itself is the
// source language). Also checks ?lang= under a Turkish browser, the Language row (menus yes, pause no),
// the reload on change, the boot cards and that no i18n key is missing.
// Canvas-drawn text (book cover, story pages, chapter sign) is not in the DOM: look at the screenshots.
// Screenshots: tools/out/i18n/<en|tr>-<screen>.png. Starts tools/serve.py itself if the port is free.
// Usage: node tools/scenarios/i18n.mjs [--port 8776]
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'tools', 'out', 'i18n');
const arg = (name, fb) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fb);
const port = +arg('--port', 8776);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_BASE = `http://127.0.0.1:${port}/`;

const TR_LETTERS = /[çğıöşüÇĞİÖŞÜâÂîÎ]/;
// The brand stays Turkish everywhere, and the language row names each language in its own language.
const BRAND = /K[âÂ][ğĞ][ıI]t|KÂĞIT/g;
const ENDONYM = /Türkçe/g;

function portInUse(p) {
  return new Promise((resolve) => {
    const s = net.connect({ port: p, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

// Turkish words of 4+ letters that the English table does not also contain.
async function turkishOnlyWords() {
  const tr = (await import(pathToFileURL(path.join(ROOT, 'src', 'i18n', 'tr.js')).href)).default;
  const en = (await import(pathToFileURL(path.join(ROOT, 'src', 'i18n', 'en.js')).href)).default;
  const words = (table) => {
    const out = new Set();
    for (const v of Object.values(table)) for (const w of v.replace(/\{\w+\}/g, ' ').toLowerCase().match(/\p{L}+/gu) || []) out.add(w);
    return out;
  };
  const enWords = words(en);
  const only = new Set();
  for (const w of words(tr)) if (w.length >= 4 && !enWords.has(w) && !['kâğıt', 'kart'].includes(w)) only.add(w);
  return only;
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) rmSync(path.join(OUT, f));

let server = null;
let browser = null;
const consoleMsgs = [];

// Everything a player can read on the current screen, plus text that spills out of its box. A text node
// or lettering SVG spills when it sticks out (> 2 px sideways) of its nearest block ancestor, of the nearest
// clipping ancestor (overflow hidden/auto/…, vertical too) or of the viewport. Hidden layers and the
// screen-reader-only title do not count.
const collect = () => {
  // entrance and stamp animations scale and shift things for a moment: judge the settled layout
  for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless animation */ } }
  const parts = [document.title, document.body.innerText || ''];
  for (const el of document.querySelectorAll('[aria-label],[title]')) parts.push(el.getAttribute('aria-label') || '', el.getAttribute('title') || '');
  const overflow = [];
  const TOL = 4; // a few px of shadow, tilt and sub-pixel rounding are normal paper-cut looks
  const shown = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || e.classList.contains('kk-sr')) return false;
    }
    return true;
  };
  const blockOf = (el) => { let e = el; while (e && e.parentElement && /^(inline|contents)$/.test(getComputedStyle(e).display)) e = e.parentElement; return e; };
  const clipOf = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return e; } return null; };
  const judge = (label, owner, r, tol = TOL) => {
    if (!r.width || !r.height) return;
    const blk = blockOf(owner).getBoundingClientRect();
    const clipEl = clipOf(owner);
    const clip = clipEl && clipEl.getBoundingClientRect();
    const out = (b, vertical) => r.left < b.left - tol || r.right > b.right + tol || (vertical && (r.top < b.top - tol || r.bottom > b.bottom + tol));
    const why = out(blk, false) ? 'box' : clip && out(clip, true) ? 'clip' : out({ left: 0, right: innerWidth, top: 0, bottom: innerHeight }, false) ? 'viewport' : '';
    if (why) overflow.push(`${why}: ${owner.tagName.toLowerCase()}.${String(owner.className || '').split(' ').join('.')} "${label.slice(0, 40)}" ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round((why === 'clip' ? clip : blk).left)}..${Math.round((why === 'clip' ? clip : blk).right)}`);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const txt = node.textContent.trim();
    const owner = node.parentElement;
    if (!txt || !owner || /^(SCRIPT|STYLE|TITLE)$/.test(owner.tagName) || owner.closest('svg') || !shown(owner)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    judge(txt, owner, range.getBoundingClientRect());
  }
  for (const svg of document.querySelectorAll('svg[aria-label]')) {
    const owner = (svg.closest('.kk-lt') || svg).parentElement; // the span is only a wrapper: judge against its parent
    if (shown(owner)) judge(svg.getAttribute('aria-label'), owner, svg.getBoundingClientRect(), 8); // lettering bleeds its offset shadow
  }
  return { text: parts.join('\n'), overflow };
};

async function open(label, contextOpts, { url = URL_BASE, init = null, boot = true } = {}) {
  const ctx = await browser.newContext(contextOpts);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${label}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleMsgs.push(`[${label}] pageerror: ${e.message}`));
  await page.goto(url);
  if (boot) {
    await page.waitForFunction(() => window.__kk && window.__kk.ready, null, { timeout: 45000 });
    await page.evaluate(() => window.__kk.setAutoPause(false));
    await sleep(700);
  }
  return { ctx, page, ev: (fn, a) => page.evaluate(fn, a), wait: (fn, a, timeout = 20000) => page.waitForFunction(fn, a, { timeout }) };
}

// One full walk of every screen in one language; returns { screens, hits, overflow }.
async function walk(locale, prefix) {
  const screens = [];
  const T = await open(prefix, { locale, viewport: { width: 1280, height: 720 } });
  const { page, ev, wait } = T;
  let n = 0;
  async function snap(name, { settle = 700, shot = true } = {}) {
    await sleep(settle);
    const got = await ev(collect);
    screens.push({ name, ...got });
    if (shot) await page.screenshot({ path: path.join(OUT, `${prefix}-${String(++n).padStart(2, '0')}-${name}.png`) });
  }
  const api = (fn, ...args) => ev(([f, a]) => window.__kk.game.api[f](...a), [fn, args]);
  const lang = await ev(() => document.documentElement.lang);
  check(`${prefix}: document language is ${prefix}`, lang === prefix, lang);

  // ---- title and menus
  await snap('title');
  await api('unlockAudio');
  await api('setMenuScreen', 'mode');
  await snap('mode', { settle: 1400 });
  await api('setSelection', { mode: 'gp' });
  await api('setMenuScreen', 'class');
  await snap('class');
  await api('setMenuScreen', 'character', { characterId: 'tilki' });
  await snap('character');
  await api('setMenuScreen', 'character', { characterId: 'ahtapot' });
  await snap('character-2');
  await api('setSelection', { mode: 'single', cls: '120', characterId: 'tilki' });
  await api('setMenuScreen', 'track', { trackId: 'bosphorus' });
  await snap('track');
  for (const id of ['meadow', 'glacier', 'desk']) {
    await api('setMenuScreen', 'track', { trackId: id });
    await snap(`track-${id}`, { settle: 500 });
  }
  await api('setMenuScreen', 'settings');
  await snap('settings');
  const langRow = await ev(() => !!document.querySelector('.kk-srow[data-key="lang"]'));
  check(`${prefix}: Language row in the title settings`, langRow);
  await api('setMenuScreen', 'controls');
  await sleep(600);
  for (const dev of ['keyboard', 'gamepad', 'touch']) {
    // focusing a device tab picks it: the first tab is focused on entry, → moves along
    if (dev !== 'keyboard') await page.keyboard.press('ArrowRight');
    await snap(`controls-${dev}`, { settle: 500 });
  }

  // ---- intro card, countdown with the first-race card, race, HUD
  await ev(() => {
    const c = window.__kk.game.systems.cinematics;
    c.__play = c.play;
    c.play = (shot, o) => (shot === 'intro' ? new Promise(() => {}) : c.__play(shot, o));
  });
  // not awaited: with the intro held open startRace only settles once it is skipped
  await ev(() => { window.__kk.startRace({ mode: 'single', track: 'bosphorus', cls: '120', character: 'tilki' }); });
  await wait(() => window.__kk.game.phase === 'intro');
  await snap('intro', { settle: 900 });
  await ev(() => { const c = window.__kk.game.systems.cinematics; c.play = c.__play; });
  await api('skipCinematic');
  await wait(() => window.__kk.game.phase === 'countdown', null, 20000);
  await snap('countdown-tutorial', { settle: 400 });
  await wait(() => window.__kk.game.phase === 'race', null, 15000);
  await sleep(600);
  await ev(() => { window.__kk.game.player.autopilot = true; });
  await ev(() => window.__kk.giveItem(window.__kk.game.player.index, 'rocket3'));
  await snap('race-item', { settle: 500 });
  for (const id of ['rocket', 'gum', 'plane', 'homing', 'ink', 'foil', 'scissors']) {
    await ev((i) => window.__kk.giveItem(window.__kk.game.player.index, i), id);
    await sleep(150);
    screens.push({ name: `item-${id}`, ...(await ev(collect)) });
  }
  await ev(() => window.__kk.giveItem(window.__kk.game.player.index, 'plane'));
  await ev(() => {
    const g = window.__kk.game;
    g.events.emit('wrongWay', { kart: g.player, on: true });
    g.events.emit('finalLap', { kart: g.player });
    g.events.emit('boost', { kart: g.player, source: 'start', grade: 'perfect' });
    g.events.emit('checkpoint', { kart: g.player, index: 0, lap: 1, split: -0.42 });
    g.events.emit('threat', { kart: g.player, kind: 'homing', eta: 1.5 });
  });
  await snap('race-banners', { settle: 450 });
  await ev(() => {
    const g = window.__kk.game;
    g.events.emit('wrongWay', { kart: g.player, on: false });
    g.events.emit('boost', { kart: g.player, source: 'start', grade: 'good' });
    g.events.emit('hit', { kart: g.player, cause: 'burnout' });
    g.events.emit('lap', { kart: g.player, lap: 2 });
  });
  await snap('race-tags', { settle: 350 });
  await ev(() => { const g = window.__kk.game; g.events.emit('drift', { kart: g.player, state: 'tier', tier: 1 }); });
  await snap('race-hint', { settle: 500 });

  // ---- pause (settings there must not offer the language row)
  const press = async (k, ms = 350) => { await page.keyboard.press(k); await sleep(ms); };
  await api('setPaused', true);
  await snap('pause', { settle: 800 });
  await press('ArrowDown'); await press('ArrowDown'); await press('Enter', 600);
  const pauseLangRow = await ev(() => !!document.querySelector('.kk-srow[data-key="lang"]'));
  const pauseRows = await ev(() => document.querySelectorAll('.kk-srow').length);
  check(`${prefix}: no Language row in the pause settings`, !pauseLangRow && pauseRows === 9, `rows=${pauseRows}`);
  await snap('pause-settings', { settle: 200 });
  await press('Escape', 600);
  await press('ArrowDown'); await press('Enter', 600);
  await snap('pause-controls', { settle: 300 });
  await api('setPaused', false);

  // ---- finishing: one-lap race with the CPU karts held on the grid, so the player finishes first
  await api('quitToTitle');
  await sleep(500);
  await ev(() => window.__kk.startRace({ mode: 'single', track: 'meadow', laps: 1, skipIntro: true }));
  await wait(() => window.__kk.game.phase === 'countdown');
  await ev(() => window.__kk.simulate(3.2));
  await sleep(1300);
  await ev(() => { for (const k of window.__kk.game.karts) if (!k.isPlayer) k.pinned = true; });
  await ev(() => {
    const g = window.__kk.game;
    for (let s = 0; s < 120 && g.player && !(g.player.finished || g.phase === 'results'); s += 0.5) window.__kk.simulate(0.5);
    window.__kk.renderFrame();
  });
  await snap('finishing', { settle: 700 });
  await wait(() => window.__kk.game.phase === 'results', null, 40000).catch(() => {});
  if (await ev(() => window.__kk.game.phase !== 'results')) await ev(() => window.__kk.finishNow());
  await wait(() => window.__kk.game.phase === 'results', null, 20000);
  await snap('results-single', { settle: 1800 });
  await api('quitToTitle');
  await sleep(500);

  // ---- time trial with a new record
  await ev(() => window.__kk.startRace({ mode: 'tt', track: 'meadow', cls: '120', character: 'tilki', laps: 1, skipIntro: true }));
  await wait(() => window.__kk.game.phase === 'countdown');
  await ev(() => {
    const g = window.__kk.game;
    window.__kk.simulate(3.2);
    for (let s = 0; s < 150 && g.player && g.phase !== 'results'; s += 0.5) window.__kk.simulate(0.5);
  });
  await wait(() => window.__kk.game.phase === 'results', null, 20000);
  await snap('results-tt', { settle: 1800 });
  await api('quitToTitle');
  await sleep(500);
  await api('setSelection', { mode: 'tt', cls: '120', characterId: 'tilki' });
  await api('setMenuScreen', 'track', { trackId: 'meadow' });
  await snap('track-tt-record', { settle: 900 });
  await api('setMenuScreen', 'mode');

  // ---- Grand Prix: results with points, standings, podium
  await ev(() => window.__kk.startGP({ index: 1, standings: { tilki: 30, kurbaga: 34, penguen: 20, ayi: 25, kedi: 12, baykus: 18, tavsan: 6, ahtapot: 9 } }).catch(() => {}));
  await wait(() => ['intro', 'countdown', 'race'].includes(window.__kk.game.phase));
  await api('skipCinematic');
  await wait(() => ['countdown', 'race'].includes(window.__kk.game.phase));
  await ev(() => window.__kk.finishNow());
  await wait(() => window.__kk.game.phase === 'results');
  await snap('results-gp', { settle: 1800 });
  await page.keyboard.press('Enter');
  await snap('standings', { settle: 1500 });
  await api('quitToTitle');
  await sleep(500);
  await ev(() => window.__kk.startGP({ index: 3, standings: { tilki: 30, kurbaga: 34, penguen: 20, ayi: 25, kedi: 12, baykus: 18, tavsan: 6, ahtapot: 9 } }).catch(() => {}));
  await wait(() => ['intro', 'countdown', 'race'].includes(window.__kk.game.phase));
  await api('skipCinematic');
  await wait(() => ['countdown', 'race'].includes(window.__kk.game.phase));
  await ev(() => window.__kk.finishNow());
  await wait(() => window.__kk.game.phase === 'results');
  await sleep(1200);
  await page.keyboard.press('Enter');
  await sleep(1200);
  await page.keyboard.press('Enter');
  await wait(() => window.__kk.game.phase === 'podium', null, 20000);
  await snap('podium', { settle: 2600 });
  await api('quitToTitle');
  await sleep(500);
  const miss = await ev(() => window.__kk.warnings.filter((w) => w.includes('[i18n]')));
  check(`${prefix}: no missing i18n keys`, miss.length === 0, miss.slice(0, 3).join(' | '));
  await T.ctx.close();
  return screens;
}

// Touch phone (landscape race with the touch keys, portrait hint).
async function touchWalk(locale, prefix) {
  const screens = [];
  const T = await open(`${prefix}-touch`, { locale, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const { page, ev, wait } = T;
  let n = 0;
  async function snap(name, settle = 600) {
    await sleep(settle);
    screens.push({ name: `touch-${name}`, ...(await ev(collect)) });
    await page.screenshot({ path: path.join(OUT, `${prefix}-touch-${String(++n).padStart(2, '0')}-${name}.png`) });
  }
  await ev(() => window.__kk.game.api.unlockAudio());
  await ev(() => window.__kk.game.api.setMenuScreen('mode'));
  await snap('mode', 1300);
  await ev(() => window.__kk.startRace({ mode: 'single', track: 'meadow', skipIntro: true }));
  await wait(() => window.__kk.game.phase === 'countdown');
  await snap('countdown-tutorial', 400);
  await wait(() => window.__kk.game.phase === 'race', null, 15000);
  await sleep(500);
  await snap('race-touch', 500);
  await ev(() => window.__kk.game.api.setSetting('autoAccelerate', true));
  await snap('race-autogas', 300);
  await T.ctx.close();
  // portrait phone: the "better in landscape" hint
  const P = await open(`${prefix}-portrait`, { locale, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await P.ev(() => window.__kk.game.api.unlockAudio());
  await P.ev(() => window.__kk.game.api.setMenuScreen('mode'));
  await sleep(1400);
  screens.push({ name: 'portrait-mode', ...(await P.ev(collect)) });
  await P.page.screenshot({ path: path.join(OUT, `${prefix}-portrait-01-mode.png`) });
  await P.ev(() => { window.__kk.startRace({ mode: 'single', track: 'meadow', skipIntro: true }); });
  await P.wait(() => window.__kk.game.phase === 'race', null, 30000);
  await sleep(900);
  screens.push({ name: 'portrait-race', ...(await P.ev(collect)) });
  await P.page.screenshot({ path: path.join(OUT, `${prefix}-portrait-02-race.png`) });
  await P.ctx.close();
  return screens;
}

// Everything a screen exposes, judged for Turkish leftovers.
function judge(screens, only) {
  const hits = [];
  const overflow = [];
  for (const s of screens) {
    const text = s.text.replace(BRAND, '').replace(ENDONYM, '');
    const letters = [...new Set(text.split(/\s+/).filter((w) => TR_LETTERS.test(w)))];
    const wordsFound = [...new Set((text.toLowerCase().match(/\p{L}+/gu) || []).filter((w) => only.has(w)))];
    if (letters.length || wordsFound.length) hits.push({ screen: s.name, letters: letters.slice(0, 8), words: wordsFound.slice(0, 8) });
    if (s.overflow.length) overflow.push({ screen: s.name, elements: [...new Set(s.overflow)].slice(0, 6) });
  }
  return { hits, overflow };
}

// ------------------------------------------------------------------------------------------ run
const summary = {};
try {
  if (!(await portInUse(port))) {
    server = spawn('python3', [path.join('tools', 'serve.py'), String(port)], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await portInUse(port)); i++) await sleep(100);
  }
  const l = await launch({ locale: 'en-US' });
  browser = l.browser;
  console.log(`renderer: ${l.renderer}`);
  const only = await turkishOnlyWords();

  for (const [locale, prefix] of [['en-US', 'en'], ['tr-TR', 'tr']]) {
    const screens = [...(await walk(locale, prefix)), ...(await touchWalk(locale, prefix))];
    const { hits, overflow } = judge(screens, only);
    summary[prefix] = { screens: screens.length, turkishHits: prefix === 'en' ? hits.length : null, overflowScreens: overflow.length };
    if (prefix === 'en') {
      check(`en: 0 Turkish hits over ${screens.length} screens`, hits.length === 0, JSON.stringify(hits));
    }
    check(`${prefix}: 0 overflowing text elements over ${screens.length} screens`, overflow.length === 0, JSON.stringify(overflow));
  }

  // ---- ?lang= under a Turkish browser, the reload on change, boot cards
  {
    const T = await open('forced', { locale: 'tr-TR', viewport: { width: 1280, height: 720 } }, { url: URL_BASE + '?lang=en' });
    const info = await T.ev(() => ({ lang: document.documentElement.lang, aria: document.querySelector('.kk-coverwrap')?.getAttribute('aria-label'), stored: localStorage.getItem('kk1:settings') }));
    check('?lang=en under tr-TR: English title, not persisted', info.lang === 'en' && /tap to start/.test(info.aria || '') && !/"lang"/.test(info.stored || ''), JSON.stringify(info));
    await T.ev(() => window.__kk.game.api.setMenuScreen('settings'));
    await sleep(600);
    await T.ev(() => document.querySelector('.kk-srow[data-key="lang"] .kk-opt[data-value="tr"]').click());
    await T.page.waitForFunction(() => document.documentElement.lang === 'tr' && window.__kk && window.__kk.ready, null, { timeout: 45000 });
    const after = await T.ev(() => ({ href: location.href, stored: JSON.parse(localStorage.getItem('kk1:settings') || '{}').lang, aria: document.querySelector('.kk-coverwrap')?.getAttribute('aria-label') }));
    check('picking Türkçe stores it, drops ?lang= and reloads in Turkish', after.stored === 'tr' && !/lang=/.test(after.href) && /dokun/.test(after.aria || ''), JSON.stringify(after));
    await T.ctx.close();
  }
  {
    const T = await open('stored', { locale: 'en-US', viewport: { width: 1280, height: 720 } }, { init: () => { try { if (!localStorage.getItem('kk1:seed')) { localStorage.setItem('kk1:seed', '1'); localStorage.setItem('kk1:settings', JSON.stringify({ lang: 'tr' })); } } catch { /* ignore */ } } });
    const lang = await T.ev(() => document.documentElement.lang);
    check('stored lang=tr wins over an English browser', lang === 'tr', lang);
    await T.ctx.close();
  }
  {
    const cards = {};
    const noGl = () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...r) { return type === 'webgl2' || type === 'webgl' ? null : get.call(this, type, ...r); }; };
    const lateThrow = () => { const add = window.addEventListener; window.addEventListener = function (type, ...rest) { if (type === 'gamepaddisconnected') throw new Error('probe: late boot throw'); return add.call(this, type, ...rest); }; };
    const screens = [];
    for (const [name, opts] of [['no-webgl2', { init: noGl }], ['late-throw', { init: lateThrow }], ['cdn-failure', { init: null, abort: true }]]) {
      const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 720 } });
      if (opts.init) await ctx.addInitScript(opts.init);
      const page = await ctx.newPage();
      if (opts.abort) await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort('failed'));
      await page.goto(URL_BASE);
      await sleep(2200);
      const got = await page.evaluate(collect);
      screens.push({ name, ...got });
      cards[name] = (await page.evaluate(() => document.getElementById('kk-boot')?.innerText || '')).replace(/\s+/g, ' ');
      await page.screenshot({ path: path.join(OUT, `en-boot-${name}.png`) });
      await ctx.close();
    }
    const { hits, overflow } = judge(screens, only);
    check('boot cards (no WebGL2, late throw, CDN failure) in English', hits.length === 0 && overflow.length === 0 && Object.values(cards).every((c) => /[a-z]{4}/.test(c)), JSON.stringify({ cards, hits, overflow }));
  }

  const bad = consoleMsgs.filter((m) => !/probe: late boot throw|WebGL|\[boot\]|Failed to load resource|net::ERR|ERR_FAILED|Content Security|importmap|Failed to fetch dynamically|TypeError: Failed to resolve|Cannot read prop/i.test(m));
  check('no unexpected console errors or warnings', bad.length === 0, bad.slice(0, 5).join(' | '));
  summary.checks = `${checks.filter((c) => c.ok).length}/${checks.length}`;
  console.log(JSON.stringify(summary));
} catch (e) {
  console.error(e);
  check('scenario ran to the end', false, String(e && e.message || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length ? 1 : 0);
