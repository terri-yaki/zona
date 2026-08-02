import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { shortcutsSource } = require('../../plugins/with-zona-shortcuts.cjs') as { shortcutsSource: string };

describe('Zona Shortcuts config plugin', () => {
  it('ships inbox and alert-preparation app intents', () => {
    expect(shortcutsSource).toContain('struct OpenZonaInboxIntent: AppIntent');
    expect(shortcutsSource).toContain('struct PrepareZonaAlertIntent: AppIntent');
    expect(shortcutsSource).toContain('struct ZonaAppShortcuts: AppShortcutsProvider');
    expect(shortcutsSource).toContain('bell.badge.fill');
  });
});
