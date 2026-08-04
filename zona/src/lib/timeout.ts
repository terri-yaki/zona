export const FOREGROUND_REFRESH_TIMEOUT_MS = 15_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
  });
}
