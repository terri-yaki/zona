import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the universal-iPad config: reverting either flag would silently
// re-enable Split View under the portrait lock or drop tablet support.
const appJsonPath = fileURLToPath(new URL('../../app.json', import.meta.url));
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')) as {
  expo?: { orientation?: string; ios?: { supportsTablet?: boolean; requireFullScreen?: boolean } };
};

describe('iPad support config', () => {
  it('ships as a universal app with tablet support enabled', () => {
    expect(appJson.expo?.ios?.supportsTablet).toBe(true);
  });

  it('locks iPad to full screen so Split View and Slide Over stay disabled', () => {
    expect(appJson.expo?.ios?.requireFullScreen).toBe(true);
  });

  it('keeps the portrait-only orientation the full-screen lock relies on', () => {
    expect(appJson.expo?.orientation).toBe('portrait');
  });
});
