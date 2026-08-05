import { describe, expect, it, vi } from 'vitest';

import { act } from 'react';
import { create } from 'react-test-renderer';

import { InboxSkeleton } from '../components/InboxSkeleton';

// Storage boundary mock (theme-preference imports AsyncStorage at module load).
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('InboxSkeleton', () => {
  it('hides its placeholder rows from assistive technology so a wrapper announcement is the only one read', async () => {
    let tree: ReturnType<typeof create> | undefined;
    await act(async () => {
      tree = create(<InboxSkeleton />);
    });

    const container = tree!.root.findAll((node) => (node.type as unknown) === 'View')[0];
    expect(container.props.accessibilityElementsHidden).toBe(true);
    expect(container.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
