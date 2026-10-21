const globalForLimiter = globalThis as unknown as { loginAttempts?: Map<string, number[]> };

/** Неудачные попытки входа по ключу (почте): время каждой в мс. Живёт в памяти процесса. */
const attempts = globalForLimiter.loginAttempts ?? new Map<string, number[]>();
globalForLimiter.loginAttempts = attempts;

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function recent(key: string, now: number): number[] {
  const list = (attempts.get(key) ?? []).filter((time) => now - time < LOGIN_WINDOW_MS);
  if (list.length > 0) {
    attempts.set(key, list);
  } else {
    attempts.delete(key);
  }
  return list;
}

/** Выбрасывает записи, у которых все попытки вышли за окно, — чтобы Map не пухла. */
function sweep(now: number): void {
  for (const key of attempts.keys()) {
    recent(key, now);
  }
}

/** true — лимит исчерпан, пароль проверять нельзя. */
export function isLoginBlocked(key: string, now = Date.now()): boolean {
  return recent(key, now).length >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  sweep(now);
  attempts.set(key, [...recent(key, now), now]);
}

export function resetLoginFailures(key: string): void {
  attempts.delete(key);
}
