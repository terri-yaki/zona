import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { withTimeout, FOREGROUND_REFRESH_TIMEOUT_MS } from '../lib/timeout';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the value when the promise settles before the timeout', async () => {
    const promise = Promise.resolve('ok');
    const result = withTimeout(promise, FOREGROUND_REFRESH_TIMEOUT_MS, 'timed out');
    await expect(result).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the given message when the promise never settles', async () => {
    const promise = new Promise<string>(() => undefined);
    const result = withTimeout(promise, FOREGROUND_REFRESH_TIMEOUT_MS, 'timed out');
    const rejection = result.catch((error) => error);
    await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('timed out');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timeout when the provided promise rejects', async () => {
    const promise = Promise.reject(new Error('original error'));
    const result = withTimeout(promise, FOREGROUND_REFRESH_TIMEOUT_MS, 'timed out');
    await expect(result).rejects.toThrow('original error');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the timeout rejection when the wrapped promise rejects late', async () => {
    // Production sequence for a hung RPC that eventually errors: the timeout
    // has already settled the wrapper, so the late rejection must be absorbed
    // without changing the outcome or surfacing an unhandled rejection.
    let rejectLate: (reason: unknown) => void = () => undefined;
    const promise = new Promise<string>((_, reject) => {
      rejectLate = reject;
    });
    const result = withTimeout(promise, FOREGROUND_REFRESH_TIMEOUT_MS, 'timed out');
    const settled = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    rejectLate(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(FOREGROUND_REFRESH_TIMEOUT_MS);
    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('timed out');
    expect(vi.getTimerCount()).toBe(0);
  });
});
