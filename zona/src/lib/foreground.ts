import { AppState } from 'react-native';

/**
 * Calls `handler` immediately (fresh open) and again every time the app
 * returns to the foreground. Returns the unsubscribe function. Surfaces that
 * must stay current (inbox, sources) hook their forced refresh in here so a
 * resume or cold start always pulls the server, regardless of cache
 * freshness.
 */
export function runOnForeground(handler: () => void): () => void {
  handler();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') handler();
  });
  return () => subscription.remove();
}
