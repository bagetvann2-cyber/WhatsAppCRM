import { expect, test } from "vitest";
import {
  DEFAULT_SCHEDULE,
  describeSchedule,
  isWorkingTime,
  localParts,
  normalizeSchedule,
  type DaySchedule,
} from "@/lib/automation";

const TZ = "Asia/Almaty";

// Алматы — UTC+5, поэтому 04:00 UTC это 09:00 по местному.
const mondayMorning = new Date("2026-08-17T04:30:00Z"); // пн, 09:30
const mondayNight = new Date("2026-08-17T17:30:00Z"); // пн, 22:30
const sundayNoon = new Date("2026-08-16T07:00:00Z"); // вс, 12:00

test("местное время считается по часовому поясу компании", () => {
  expect(localParts(mondayMorning, TZ)).toEqual({ weekday: 0, minutes: 9 * 60 + 30 });
  expect(localParts(sundayNoon, TZ)).toEqual({ weekday: 6, minutes: 12 * 60 });
  // Тот же момент в другом поясе — другой ответ.
  expect(localParts(mondayMorning, "UTC").minutes).toBe(4 * 60 + 30);
});

test("рабочее время определяется по расписанию", () => {
  expect(isWorkingTime(DEFAULT_SCHEDULE, TZ, mondayMorning)).toBe(true);
  expect(isWorkingTime(DEFAULT_SCHEDULE, TZ, mondayNight)).toBe(false);
  expect(isWorkingTime(DEFAULT_SCHEDULE, TZ, sundayNoon)).toBe(false);
});

test("граница дня: начало включается, конец нет", () => {
  const nineSharp = new Date("2026-08-17T04:00:00Z"); // 09:00
  const sevenSharp = new Date("2026-08-17T14:00:00Z"); // 19:00

  expect(isWorkingTime(DEFAULT_SCHEDULE, TZ, nineSharp)).toBe(true);
  expect(isWorkingTime(DEFAULT_SCHEDULE, TZ, sevenSharp)).toBe(false);
});

test("ночная смена через полночь продолжается на следующий день", () => {
  const nightShift: DaySchedule[] = DEFAULT_SCHEDULE.map(() => ({
    enabled: true,
    from: "20:00",
    to: "02:00",
  }));

  const beforeMidnight = new Date("2026-08-17T17:00:00Z"); // пн, 22:00
  const afterMidnight = new Date("2026-08-17T20:00:00Z"); // вт, 01:00
  const daytime = new Date("2026-08-17T09:00:00Z"); // пн, 14:00

  expect(isWorkingTime(nightShift, TZ, beforeMidnight)).toBe(true);
  expect(isWorkingTime(nightShift, TZ, afterMidnight)).toBe(true);
  expect(isWorkingTime(nightShift, TZ, daytime)).toBe(false);
});

test("если рабочих дней нет, рабочего времени тоже нет", () => {
  const closed = DEFAULT_SCHEDULE.map((day) => ({ ...day, enabled: false }));
  expect(isWorkingTime(closed, TZ, mondayMorning)).toBe(false);
});

test("расписание из формы приводится к строгому виду", () => {
  const messy = [
    { enabled: true, from: "9:00", to: "19:00" },
    { enabled: "да", from: "25:00", to: "19:00" },
  ];

  const clean = normalizeSchedule(messy);

  expect(clean).toHaveLength(7);
  // Неверное время заменяется значением по умолчанию, а не ломает расписание.
  expect(clean[0]).toEqual({ enabled: true, from: "09:00", to: "19:00" });
  expect(clean[1]).toEqual({ enabled: true, from: "09:00", to: "19:00" });
  expect(clean[6].enabled).toBe(false);
  expect(normalizeSchedule(null)).toHaveLength(7);
});

test("расписание описывается словами", () => {
  expect(describeSchedule(DEFAULT_SCHEDULE)).toContain("часы отличаются по дням");

  const uniform = DEFAULT_SCHEDULE.map((day, index) => ({
    enabled: index < 5,
    from: "09:00",
    to: "18:00",
  }));
  expect(describeSchedule(uniform)).toBe("по, вт, ср, че, пя — с 09:00 до 18:00");

  const closed = DEFAULT_SCHEDULE.map((day) => ({ ...day, enabled: false }));
  expect(describeSchedule(closed)).toContain("Рабочих дней не выбрано");
});
