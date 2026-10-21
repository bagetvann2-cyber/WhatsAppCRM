import { expect, test } from "vitest";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  isLoginBlocked,
  recordLoginFailure,
  resetLoginFailures,
} from "@/lib/rate-limit";

const t0 = 1_000_000;

test("блокирует после 10 неудачных попыток и снимает блок по истечении окна", () => {
  const key = "limit-a@example.com";
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) recordLoginFailure(key, t0 + i);
  expect(isLoginBlocked(key, t0 + 100)).toBe(false);

  recordLoginFailure(key, t0 + 100);
  expect(isLoginBlocked(key, t0 + 200)).toBe(true);
  expect(isLoginBlocked(key, t0 + 100 + LOGIN_WINDOW_MS + 1)).toBe(false);
});

test("успешный вход сбрасывает счётчик, ключи независимы", () => {
  const key = "limit-b@example.com";
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) recordLoginFailure(key, t0);
  expect(isLoginBlocked(key, t0)).toBe(true);
  expect(isLoginBlocked("limit-other@example.com", t0)).toBe(false);

  resetLoginFailures(key);
  expect(isLoginBlocked(key, t0)).toBe(false);
});
