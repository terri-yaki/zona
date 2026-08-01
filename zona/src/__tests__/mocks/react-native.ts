// Minimal react-native stub for vitest: only the surface data-layer modules use.
type AppStateHandler = (state: string) => void;

const appStateHandlers = new Set<AppStateHandler>();

export const AppState = {
  addEventListener: (_event: string, handler: AppStateHandler) => {
    appStateHandlers.add(handler);
    return { remove: () => appStateHandlers.delete(handler) };
  },
  // Test-only trigger: simulate an app-state transition.
  __fire(state: string) {
    for (const handler of [...appStateHandlers]) handler(state);
  },
  __reset() {
    appStateHandlers.clear();
  },
};

export const Platform = {
  OS: 'ios' as const,
};

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
};
