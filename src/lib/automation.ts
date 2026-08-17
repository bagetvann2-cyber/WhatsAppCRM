export type DaySchedule = { enabled: boolean; from: string; to: string };

export const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

/** Пн–пт 9:00–19:00, суббота короче, воскресенье выходной. */
export const DEFAULT_SCHEDULE: DaySchedule[] = [
  { enabled: true, from: "09:00", to: "19:00" },
  { enabled: true, from: "09:00", to: "19:00" },
  { enabled: true, from: "09:00", to: "19:00" },
  { enabled: true, from: "09:00", to: "19:00" },
  { enabled: true, from: "09:00", to: "19:00" },
  { enabled: true, from: "10:00", to: "16:00" },
  { enabled: false, from: "10:00", to: "16:00" },
];

export const DEFAULT_GREETING =
  "Здравствуйте! Мы получили ваше сообщение и ответим в ближайшее время.";

export const DEFAULT_AWAY =
  "Спасибо за обращение! Сейчас мы не работаем и ответим, как только вернёмся.";

export const TIMEZONES = [
  { value: "Asia/Almaty", label: "Алматы, Астана (UTC+5)" },
  { value: "Asia/Aqtobe", label: "Актобе, Атырау (UTC+5)" },
  { value: "Asia/Aqtau", label: "Актау (UTC+5)" },
] as const;

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Приводит присланное из формы расписание к строгому виду. */
export function normalizeSchedule(raw: unknown): DaySchedule[] {
  const source = Array.isArray(raw) ? raw : [];

  return DEFAULT_SCHEDULE.map((fallback, index) => {
    const day = source[index] as Partial<DaySchedule> | undefined;
    const from = typeof day?.from === "string" && isValidTime(day.from) ? day.from : fallback.from;
    const to = typeof day?.to === "string" && isValidTime(day.to) ? day.to : fallback.to;

    return { enabled: Boolean(day?.enabled), from, to };
  });
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Местные день недели и минуты от полуночи в часовом поясе компании.
 * Считаем через Intl, а не арифметикой со смещением: переход на летнее
 * время и прочие сдвиги учитываются самой платформой.
 */
export function localParts(date: Date, timezone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekday = order.indexOf(get("weekday"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return { weekday: weekday === -1 ? 0 : weekday, minutes: hour * 60 + minute };
}

/** Рабочее ли сейчас время. Смена «с 20:00 до 02:00» считается через полночь. */
export function isWorkingTime(
  schedule: DaySchedule[],
  timezone: string,
  date: Date = new Date(),
): boolean {
  const days = normalizeSchedule(schedule);
  const { weekday, minutes } = localParts(date, timezone);
  const today = days[weekday];

  if (today?.enabled) {
    const from = minutesOf(today.from);
    const to = minutesOf(today.to);

    if (from <= to ? minutes >= from && minutes < to : minutes >= from) {
      return true;
    }
  }

  // Ночная смена, начавшаяся вчера, может ещё продолжаться.
  const yesterday = days[(weekday + 6) % 7];
  if (yesterday?.enabled) {
    const from = minutesOf(yesterday.from);
    const to = minutesOf(yesterday.to);
    if (from > to && minutes < to) {
      return true;
    }
  }

  return false;
}

/** Человеческое описание расписания для интерфейса. */
export function describeSchedule(schedule: DaySchedule[]): string {
  const days = normalizeSchedule(schedule);
  const working = days.filter((day) => day.enabled);

  if (working.length === 0) {
    return "Рабочих дней не выбрано — автоответ будет уходить всегда.";
  }

  const sameHours = working.every(
    (day) => day.from === working[0].from && day.to === working[0].to,
  );
  const names = days
    .map((day, index) => (day.enabled ? WEEKDAYS[index].slice(0, 2).toLowerCase() : null))
    .filter(Boolean)
    .join(", ");

  return sameHours
    ? `${names} — с ${working[0].from} до ${working[0].to}`
    : `${names} — часы отличаются по дням`;
}
