import { expect, test } from "vitest";
import { dayLabel, formatPhone, initials, remainingLabel, statusLabel } from "@/lib/format";

test("инициалы берутся из имени", () => {
  expect(initials("Айгерим", "77011234567")).toBe("А");
});

test("для безымянного контакта инициал не пустой", () => {
  expect(initials(null, "77011234567")).toBe("6");
  expect(initials("   ", "77011234567")).toBe("6");
});

test("казахстанский номер форматируется по группам", () => {
  expect(formatPhone("77011234567")).toBe("+7 701 123 45 67");
});

test("иностранный номер не ломается, а показывается как есть", () => {
  expect(formatPhone("15550001111")).toBe("+15550001111");
});

test("сегодняшний и вчерашний день называются словами", () => {
  const now = new Date("2026-08-17T12:00:00");
  expect(dayLabel(new Date("2026-08-17T08:00:00"), now)).toBe("Сегодня");
  expect(dayLabel(new Date("2026-08-16T23:00:00"), now)).toBe("Вчера");
});

test("более старые дни называются датой, прошлый год — с годом", () => {
  const now = new Date("2026-08-17T12:00:00");
  expect(dayLabel(new Date("2026-08-10T10:00:00"), now)).toBe("10 августа");
  expect(dayLabel(new Date("2025-12-31T10:00:00"), now)).toBe("31 декабря 2025 г.");
});

test("статусы Meta переведены", () => {
  expect(statusLabel("sent")).toBe("отправлено");
  expect(statusLabel("delivered")).toBe("доставлено");
  expect(statusLabel("read")).toBe("прочитано");
  expect(statusLabel("failed")).toBe("не доставлено");
  expect(statusLabel(null)).toBeNull();
});

test("остаток окна 24 часов читается словами", () => {
  expect(remainingLabel(3600_000 * 19 + 60_000 * 40)).toBe("19 ч 40 мин");
  expect(remainingLabel(60_000 * 7)).toBe("7 мин");
  expect(remainingLabel(5_000)).toBe("меньше минуты");
  expect(remainingLabel(0)).toBe("истекло");
  expect(remainingLabel(-1000)).toBe("истекло");
});
