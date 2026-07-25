import type { SFSymbol } from 'expo-symbols';

import { whatsNewReleases } from '../content/whats-new';
import { translate, type SupportedLanguage } from '../i18n';

/**
 * Pure What's New content pipeline: validates server-driven changelog rows
 * from `public.app_changelog`, maps them to the screen's view model for a
 * language, and produces the bundled fallback copy. No RN/Supabase imports.
 */

export type ChangelogText = { en: string; zhHant: string };

export type ChangelogRowItem = {
  icon: string;
  title: ChangelogText;
  body: ChangelogText;
};

/** A validated `app_changelog` row (locale-agnostic). */
export type ChangelogRow = {
  id: string;
  version: string;
  releasedAt: string;
  title: ChangelogText;
  summary: ChangelogText;
  items: ChangelogRowItem[];
};

export type ChangelogReleaseItem = {
  /** SF Symbol name; unknown names degrade to the AppIcon text fallback. */
  icon: SFSymbol;
  title: string;
  body: string;
};

export type ChangelogRelease = {
  id: string;
  version: string;
  dateLabel: string;
  title: string;
  summary: string;
  latest: boolean;
  items: ChangelogReleaseItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** English is the required locale; Traditional Chinese falls back to it. */
function localizedText(en: unknown, zhHant: unknown): ChangelogText | null {
  const enText = asText(en).trim();
  if (!enText) return null;
  const zhText = asText(zhHant).trim();
  return { en: enText, zhHant: zhText || enText };
}

function parseItem(value: unknown): ChangelogRowItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = localizedText(record.title_en, record.title_zh_hant);
  if (!title) return null;
  const body = localizedText(record.body_en, record.body_zh_hant) ?? { en: '', zhHant: '' };
  return { icon: asText(record.icon).trim() || 'sparkles', title, body };
}

/**
 * Validate raw PostgREST rows: malformed rows and items are dropped, missing
 * zh-Hant strings fall back to English, and the result is sorted newest first.
 */
export function parseChangelogRows(data: unknown): ChangelogRow[] {
  if (!Array.isArray(data)) return [];
  const rows: ChangelogRow[] = [];
  for (const candidate of data) {
    const record = asRecord(candidate);
    if (!record) continue;
    const version = asText(record.version).trim();
    const releasedAt = asText(record.released_at);
    const title = localizedText(record.title_en, record.title_zh_hant);
    if (!version || !title || Number.isNaN(new Date(releasedAt).getTime())) continue;
    const summary = localizedText(record.summary_en, record.summary_zh_hant) ?? { en: '', zhHant: '' };
    const items = Array.isArray(record.items)
      ? record.items.map(parseItem).filter((item): item is ChangelogRowItem => item !== null)
      : [];
    rows.push({
      id: asText(record.id).trim() || version,
      version,
      releasedAt,
      title,
      summary,
      items,
    });
  }
  return rows.sort((left, right) => new Date(right.releasedAt).getTime() - new Date(left.releasedAt).getTime());
}

function pick(text: ChangelogText, language: SupportedLanguage): string {
  return language === 'zh-Hant' ? text.zhHant : text.en;
}

export function toChangelogRelease(
  row: ChangelogRow,
  language: SupportedLanguage,
  localeTag?: string,
): ChangelogRelease {
  const dateLabel = new Intl.DateTimeFormat(localeTag ?? (language === 'en' ? 'en' : 'zh-Hant'), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(row.releasedAt));
  return {
    id: row.id,
    version: row.version,
    dateLabel,
    title: pick(row.title, language),
    summary: pick(row.summary, language),
    latest: false,
    items: row.items.map((item) => ({
      icon: item.icon as SFSymbol,
      title: pick(item.title, language),
      body: pick(item.body, language),
    })),
  };
}

/** Map validated rows to the view model, flagging the newest as the latest. */
export function toChangelogReleases(
  rows: readonly ChangelogRow[],
  language: SupportedLanguage,
  localeTag?: string,
): ChangelogRelease[] {
  return rows.map((row, index) => ({ ...toChangelogRelease(row, language, localeTag), latest: index === 0 }));
}

/** Bundled copy used when the server table is unreachable or empty. */
export function bundledChangelog(language: SupportedLanguage): ChangelogRelease[] {
  return whatsNewReleases.map((release) => ({
    id: release.id,
    version: release.version,
    dateLabel: translate(release.dateKey, {}, language),
    title: translate(release.titleKey, {}, language),
    summary: translate(release.summaryKey, {}, language),
    latest: Boolean(release.latest),
    items: release.items.map((item) => ({
      icon: item.icon,
      title: translate(item.titleKey, {}, language),
      body: translate(item.bodyKey, {}, language),
    })),
  }));
}
