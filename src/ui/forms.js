// Settings and Controls pages. Shared by the main menu and the pause menu.
import { h, svg, clear } from './dom.js';
import { FocusList } from './nav.js';
import { t } from '../i18n/i18n.js';

const PENCIL_CIRCLE = `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M9 25C5 9 88 2 95 17C99 31 24 39 7 27C2 19 30 5 66 7" fill="none" stroke="#d9483b" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;

const ON_OFF = [[true, t('set.on')], [false, t('set.off')]];
const AUTO_ON_OFF = [['auto', t('set.auto')], ['on', t('set.on')], ['off', t('set.off')]];

export const SETTING_ROWS = [
  { key: 'musicVolume', label: t('set.music'), type: 'range' },
  { key: 'sfxVolume', label: t('set.sfx'), type: 'range' },
  { key: 'muted', label: t('set.sound'), type: 'mute', options: [[false, t('set.on')], [true, t('set.off')]] },
  { key: 'quality', label: t('set.quality'), options: [['auto', t('set.auto')], ['high', t('set.quality.high')], ['medium', t('set.quality.medium')], ['low', t('set.quality.low')], ['minimal', t('set.quality.minimal')]] },
  { key: 'reducedMotion', label: t('set.reducedMotion'), options: [['auto', t('set.system')], ['on', t('set.on')], ['off', t('set.off')]] },
  { key: 'cameraShake', label: t('set.cameraShake'), options: ON_OFF },
  { key: 'touchControls', label: t('set.touchControls'), options: AUTO_ON_OFF },
  { key: 'autoAccelerate', label: t('set.autoAccelerate'), options: ON_OFF },
  { key: 'showFps', label: t('set.showFps'), options: ON_OFF },
  // Changing it reloads the page, so it is offered on the title menus only (never mid-race).
  { key: 'lang', label: t('set.lang'), menuOnly: true, options: [['auto', t('set.lang.auto')], ['tr', t('set.lang.tr')], ['en', t('set.lang.en')]] },
];

// pause: the pause menu's copy leaves out rows that need a reload (language).
export function createSettingsForm(ctx, { onBack, pause = false }) {
  const { game } = ctx;
  const rowsEl = h('div', { class: 'kk-rows' });
  const focus = new FocusList(ctx, { onBack });
  const refreshers = [];

  const value = (k) => game.settings?.[k];

  function setValue(row, v) {
    if (row.type === 'mute') {
      if (!!value('muted') !== v) ctx.api('toggleMute');
    } else {
      ctx.api('setSetting', row.key, v);
      if (row.key === 'lang') reloadForLanguage();
    }
    refresh();
  }

  // All built screens and canvases hold the old language: rebuild them from scratch (a ?lang= override
  // would win over the new choice, so it goes). Only menus offer the row, never a race.
  function reloadForLanguage() {
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); location.replace(url.href); } else location.reload();
  }

  const items = SETTING_ROWS.filter((row) => !(pause && row.menuOnly)).map((row) => {
    const el = h('div', { class: 'kk-srow', 'data-key': row.key }, h('span', null, row.label));
    let item;
    if (row.type === 'range') {
      const bars = h('div', { class: 'kk-bars' });
      const cells = [];
      for (let i = 0; i < 10; i++) {
        const c = h('i', { onclick: (e) => { e.stopPropagation(); setValue(row, (i + 1) / 10); ctx.click(); } });
        cells.push(c);
        bars.appendChild(c);
      }
      const step = (d) => setValue(row, Math.round(Math.max(0, Math.min(1, (value(row.key) ?? 0) + d / 10)) * 10) / 10);
      const minus = h('button', { class: 'kk-arrow', onclick: (e) => { e.stopPropagation(); step(-1); ctx.click(); } }, '◀');
      const plus = h('button', { class: 'kk-arrow', onclick: (e) => { e.stopPropagation(); step(1); ctx.click(); } }, '▶');
      el.appendChild(h('div', { class: 'kk-range' }, minus, bars, plus));
      refreshers.push(() => {
        const n = Math.round((value(row.key) ?? 0) * 10);
        cells.forEach((c, i) => c.classList.toggle('on', i < n));
      });
      item = { el, left: () => { step(-1); ctx.click(); }, right: () => { step(1); ctx.click(); } };
    } else {
      const opts = h('div', { class: 'kk-opts' });
      const optEls = row.options.map(([v, label]) => {
        const o = h('button', { class: 'kk-opt', 'data-value': String(v), onclick: (e) => { e.stopPropagation(); setValue(row, v); ctx.click(); } },
          svg(PENCIL_CIRCLE, 'kk-circle'), label);
        opts.appendChild(o);
        return o;
      });
      el.appendChild(opts);
      const cur = () => {
        const v = row.type === 'mute' ? !!value('muted') : value(row.key);
        const i = row.options.findIndex(([x]) => x === v);
        return i < 0 ? 0 : i;
      };
      refreshers.push(() => { const c = cur(); optEls.forEach((o, i) => o.classList.toggle('is-on', i === c)); });
      const shift = (d) => {
        const i = Math.max(0, Math.min(row.options.length - 1, cur() + d));
        if (i !== cur()) { setValue(row, row.options[i][0]); ctx.click(); }
      };
      item = { el, left: () => shift(-1), right: () => shift(1), confirm: () => shift(cur() === row.options.length - 1 ? -(row.options.length - 1) : 1) };
    }
    rowsEl.appendChild(el);
    return item;
  });

  function refresh() { for (const r of refreshers) r(); }
  refresh();
  focus.set(items, 0);

  return { el: rowsEl, focus, refresh, dispose: () => focus.release() };
}

const CONTROLS = {
  keyboard: [
    ['steer', [['k', '←'], ['k', '→'], t('ctl.or'), ['k', 'A'], ['k', 'D']]],
    ['gas', [['k', '↑'], ['k', 'W']]],
    ['brake', [['k', '↓'], ['k', 'S']]],
    ['drift', [['k', 'Space'], t('ctl.holdSteer')]],
    ['item', [['k', 'X'], ['k', 'E'], t('ctl.itemBack'), ['k', '↓'], '+', ['k', 'X']]],
    ['look', [['k', 'C']]],
    ['pause', [['k', 'Esc'], ['k', 'P']]],
    ['mute', [['k', 'M']]],
    ['restart', [['k', 'R'], t('ctl.restartTT')]],
  ],
  gamepad: [
    ['steer', [t('ctl.padSteer')]],
    ['gas', [['p', 'A'], ['pw', 'RT']]],
    ['brake', [['p', 'B'], ['pw', 'LT']]],
    ['drift', [['pw', 'RB'], t('ctl.holdSteer')]],
    ['item', [['p', 'X'], ['pw', 'LB'], t('ctl.padItemBack')]],
    ['look', [['p', 'Y']]],
    ['pause', [['pw', 'Start']]],
  ],
  touch: [
    ['steer', [t('ctl.touchSteer')]],
    ['gas', [['k', t('touch.gas')], t('ctl.touchGas')]],
    ['drift', [['k', t('touch.drift')], t('ctl.holdSteer')]],
    ['item', [['k', t('touch.item')], t('ctl.touchItem')]],
    ['brake', [['k', t('touch.brake')]]],
    ['pause', [t('ctl.touchPause')]],
  ],
};

export function glyphRow(parts) {
  return parts.map((p) => {
    if (typeof p === 'string') return h('span', null, p);
    const [kind, t] = p;
    if (kind === 'k') return h('span', { class: 'kk-key' }, t);
    return h('span', { class: kind === 'pw' ? 'kk-padb kk-wide' : 'kk-padb' }, t);
  });
}

export function controlRows(device, filter = null) {
  const list = CONTROLS[device] || CONTROLS.keyboard;
  return list.filter(([id]) => !filter || filter.includes(id))
    .map(([id, parts]) => h('div', { class: 'kk-crow' }, h('span', null, t('ctl.' + id)), h('div', null, glyphRow(parts))));
}

const DEVICES = [['keyboard', t('dev.keyboard')], ['gamepad', t('dev.gamepad')], ['touch', t('dev.touch')]];

export function createControlsForm(ctx, { onBack }) {
  let device = ctx.device();
  const tabsEl = h('div', { class: 'kk-devtabs' });
  const rowsEl = h('div', { class: 'kk-rows' });
  const el = h('div', null, tabsEl, rowsEl);
  const focus = new FocusList(ctx, { onBack });

  const tabs = DEVICES.map(([id, label]) => {
    const t = h('button', { class: 'kk-devtab' }, label);
    tabsEl.appendChild(t);
    return { id, el: t };
  });

  function render() {
    tabs.forEach((t) => t.el.classList.toggle('is-on', t.id === device));
    clear(rowsEl);
    for (const r of controlRows(device)) rowsEl.appendChild(r);
  }

  const pick = (i) => { device = tabs[i].id; render(); };
  const items = tabs.map((t, i) => ({
    el: t.el,
    confirm: () => pick(i),
    onFocus: () => pick(i),
  }));
  render();
  focus.set(items, Math.max(0, DEVICES.findIndex(([id]) => id === device)));
  return { el, focus, dispose: () => focus.release() };
}
