// Minimal react-native stub for vitest: only the surface data-layer modules use.
type AppStateHandler = (state: string) => void;

const appStateHandlers = new Set<AppStateHandler>();

export const AppState = {
  currentState: 'active',
  addEventListener: (_event: string, handler: AppStateHandler) => {
    appStateHandlers.add(handler);
    return { remove: () => appStateHandlers.delete(handler) };
  },
  // Test-only trigger: simulate an app-state transition.
  __fire(state: string) {
    AppState.currentState = state;
    for (const handler of [...appStateHandlers]) handler(state);
  },
  __reset() {
    appStateHandlers.clear();
    AppState.currentState = 'active';
  },
};

export const Platform = {
  OS: 'ios' as const,
};

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
};

// Host-component and Animated stubs so presentation-only components (e.g.
// InboxSkeleton) can be render-tested with react-test-renderer.
export const View = 'View';
export const Text = 'Text';

class AnimatedValue {
  constructor(public value: number) {}
}

export const Animated = {
  Value: AnimatedValue,
  View: 'Animated.View',
  timing: (value: AnimatedValue, config: Record<string, unknown>) => ({ value, config }),
  sequence: (animations: unknown[]) => ({ animations }),
  loop: (animation: unknown) => ({
    animation,
    start: () => undefined,
    stop: () => undefined,
  }),
};
