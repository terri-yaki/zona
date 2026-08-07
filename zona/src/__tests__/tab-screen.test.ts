import { DeviceType } from 'expo-device';
import { describe, expect, it, vi } from 'vitest';

import { IPHONE_TAB_BAR_CUSHION, resolveTabBarContentPadding } from '../components/TabScreen';

// Module-graph stubs: the padding resolver under test is pure, but
// TabScreen.tsx also pulls in the SafeAreaView shell and status banner.
// vi.mock is hoisted above the imports, so the stubs are in place first.
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock('expo-device', () => ({
  DeviceType: { UNKNOWN: 0, PHONE: 1, TABLET: 2, DESKTOP: 3, TV: 4 },
  deviceType: 1,
}));

vi.mock('@/components/RuntimeStatusBanner', () => ({ RuntimeStatusBanner: () => null }));
vi.mock('@/theme-preference', () => ({ useThemedStyles: (factory: () => unknown) => factory() }));

describe('resolveTabBarContentPadding', () => {
  it('lets Android keep only the extra padding (NativeTabs applies the inset)', () => {
    expect(resolveTabBarContentPadding('android', DeviceType.PHONE, 34, 24)).toBe(24);
    expect(resolveTabBarContentPadding('android', DeviceType.TABLET, 34, 24)).toBe(24);
  });

  it('keeps the floating-tab-bar cushion on iPhone', () => {
    expect(resolveTabBarContentPadding('ios', DeviceType.PHONE, 34, 24)).toBe(
      34 + IPHONE_TAB_BAR_CUSHION + 24,
    );
  });

  it('floors a missing home-indicator inset at 8pt on iPhone', () => {
    expect(resolveTabBarContentPadding('ios', DeviceType.PHONE, 0, 24)).toBe(
      8 + IPHONE_TAB_BAR_CUSHION + 24,
    );
  });

  it('drops the fixed cushion on iPad, where iPadOS may float the tab bar at the top or in a sidebar', () => {
    expect(resolveTabBarContentPadding('ios', DeviceType.TABLET, 20, 24)).toBe(20 + 24);
    expect(resolveTabBarContentPadding('ios', DeviceType.TABLET, 0, 24)).toBe(8 + 24);
  });

  it('treats an unknown device type like a phone so the cushion is never lost', () => {
    expect(resolveTabBarContentPadding('ios', null, 34, 24)).toBe(34 + IPHONE_TAB_BAR_CUSHION + 24);
  });
});
