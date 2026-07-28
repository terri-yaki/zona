import { describe, expect, it } from 'vitest';

import {
  bundledChangelog,
  parseChangelogRows,
  toChangelogRelease,
  toChangelogReleases,
} from '../lib/changelog';

const validRow = {
  id: 'row-2',
  version: '0.0.2',
  released_at: '2026-07-24T00:00:00+00:00',
  title_en: 'Personal release',
  title_zh_hant: '個性化版本',
  summary_en: 'English summary',
  summary_zh_hant: '中文摘要',
  items: [
    { icon: 'globe', title_en: 'Feature', title_zh_hant: '功能', body_en: 'Does things', body_zh_hant: '做嘢' },
  ],
};

const olderRow = {
  id: 'row-1',
  version: '0.0.1',
  released_at: '2026-07-19T00:00:00+00:00',
  title_en: 'Genesis',
  title_zh_hant: '創世紀',
  summary_en: 'First',
  summary_zh_hant: '第一',
  items: [],
};

describe('parseChangelogRows', () => {
  it('validates rows, keeps both locales, and sorts newest first', () => {
    const rows = parseChangelogRows([olderRow, validRow]);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('row-2');
    expect(rows[1].id).toBe('row-1');
    expect(rows[0].title).toEqual({ en: 'Personal release', zhHant: '個性化版本' });
    expect(rows[0].items[0]).toEqual({
      icon: 'globe',
      title: { en: 'Feature', zhHant: '功能' },
      body: { en: 'Does things', zhHant: '做嘢' },
    });
  });

  it('falls back to English when zh-Hant strings are missing', () => {
    const rows = parseChangelogRows([{ ...validRow, title_zh_hant: '', summary_zh_hant: null, items: [{ icon: 'x', title_en: 'Only EN' }] }]);
    expect(rows[0].title.zhHant).toBe('Personal release');
    expect(rows[0].summary.zhHant).toBe('English summary');
    expect(rows[0].items[0].title.zhHant).toBe('Only EN');
    expect(rows[0].items[0].body).toEqual({ en: '', zhHant: '' });
  });

  it('drops malformed rows and items instead of failing', () => {
    const rows = parseChangelogRows([
      null,
      'garbage',
      { version: '', released_at: '2026-07-24T00:00:00+00:00', title_en: 'No version' },
      { version: '1.0.0', released_at: 'not-a-date', title_en: 'Bad date' },
      { version: '1.0.1', title_en: 'Bad date shape' },
      { ...validRow, items: [null, { noTitle: true }, { title_en: 'Kept', icon: '' }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].items).toHaveLength(1);
    expect(rows[0].items[0].title.en).toBe('Kept');
    expect(rows[0].items[0].icon).toBe('sparkles');
  });

  it('filters individually inactive release-note items', () => {
    const rows = parseChangelogRows([{
      ...validRow,
      items: [
        { icon: 'eye', title_en: 'Published', is_active: true },
        { icon: 'eye.slash', title_en: 'Hidden', is_active: false },
        { icon: 'sparkles', title_en: 'Compatible default' },
      ],
    }]);
    expect(rows[0].items.map((item) => item.title.en)).toEqual(['Published', 'Compatible default']);
  });

  it('returns an empty list for non-array input', () => {
    expect(parseChangelogRows(null)).toEqual([]);
    expect(parseChangelogRows(undefined)).toEqual([]);
    expect(parseChangelogRows({})).toEqual([]);
  });
});

describe('toChangelogRelease(s)', () => {
  it('picks strings per language and formats the release month', () => {
    const [row] = parseChangelogRows([validRow]);
    const enRelease = toChangelogRelease(row, 'en');
    expect(enRelease.title).toBe('Personal release');
    expect(enRelease.summary).toBe('English summary');
    expect(enRelease.items[0].title).toBe('Feature');
    expect(enRelease.dateLabel).toBe('July 2026');

    const zhRelease = toChangelogRelease(row, 'zh-Hant');
    expect(zhRelease.title).toBe('個性化版本');
    expect(zhRelease.items[0].body).toBe('做嘢');
    expect(zhRelease.dateLabel).toBe('2026年7月');
  });

  it('flags only the newest release as latest', () => {
    const releases = toChangelogReleases(parseChangelogRows([olderRow, validRow]), 'en');
    expect(releases.map((release) => release.latest)).toEqual([true, false]);
  });
});

describe('bundledChangelog', () => {
  it('resolves the bundled copy in both languages with the latest flag intact', () => {
    const en = bundledChangelog('en');
    expect(en.length).toBeGreaterThan(0);
    expect(en[0].latest).toBe(true);
    expect(en[0].title).toBe('Your notifications got more personal');
    expect(en[0].dateLabel).toBe('July 2026');
    expect(en.filter((release) => release.latest)).toHaveLength(1);

    const zh = bundledChangelog('zh-Hant');
    expect(zh[0].title).toBe('通知變得更有個性');
    expect(zh[0].dateLabel).toBe('2026 年 7 月');
  });
});
