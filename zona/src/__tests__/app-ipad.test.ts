import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards universal-iPad config and orientation policy.
const appJsonPath = fileURLToPath(new URL('../../app.json', import.meta.url));
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')) as {
  expo?: {
    orientation?: string;
    ios?: {
      supportsTablet?: boolean;
      requireFullScreen?: boolean;
      infoPlist?: {
        UISupportedInterfaceOrientations?: string[];
        'UISupportedInterfaceOrientations~ipad'?: string[];
      };
    };
  };
};

describe('iPad support config', () => {
  it('ships as a universal app with tablet support enabled', () => {
    expect(appJson.expo?.ios?.supportsTablet).toBe(true);
  });

  it('locks iPad to full screen so Split View and Slide Over stay disabled', () => {
    expect(appJson.expo?.ios?.requireFullScreen).toBe(true);
  });

  it('does not force a global portrait-only orientation lock', () => {
    expect(appJson.expo?.orientation).not.toBe('portrait');
    expect(appJson.expo?.orientation).toBe('default');
  });

  it('keeps iPhone portrait-only via infoPlist', () => {
    const phone = appJson.expo?.ios?.infoPlist?.UISupportedInterfaceOrientations ?? [];
    expect(phone).toContain('UIInterfaceOrientationPortrait');
    expect(phone).not.toContain('UIInterfaceOrientationLandscapeLeft');
    expect(phone).not.toContain('UIInterfaceOrientationLandscapeRight');
  });

  it('allows iPad landscape (horizontal) as well as portrait', () => {
    const ipad = appJson.expo?.ios?.infoPlist?.['UISupportedInterfaceOrientations~ipad'] ?? [];
    expect(ipad).toEqual(expect.arrayContaining([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ]));
  });
});
