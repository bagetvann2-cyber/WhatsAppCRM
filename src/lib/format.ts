/** Инициалы для аватара: одна буква имени, для безымянного контакта — последняя цифра номера. */
export function initials(name: string | null, waId: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed[0].toUpperCase();
  }
  return waId.slice(-2, -1) || "?";
}

/** Казахстанский номер в читаемый вид: 77011234567 → +7 701 123 45 67. */
export function formatPhone(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

export function timeLabel(date: Date): string {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Ключ дня для группировки сообщений разделителями. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Подпись разделителя: свежие дни называем словами, старые — датой. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  if (dayKey(date) === dayKey(now)) {
    return "Сегодня";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) {
    return "Вчера";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Статусы Meta по-русски — оператор не обязан отличать delivered от read. */
export function statusLabel(status: string | null): string | null {
  switch (status) {
    case "sent":
      return "отправлено";
    case "delivered":
      return "доставлено";
    case "read":
      return "прочитано";
    case "failed":
      return "не доставлено";
    default:
      return status;
  }
}

/** Остаток окна 24 часов словами: «19 ч 40 мин», ближе к концу — «7 мин». */
export function remainingLabel(msLeft: number): string {
  if (msLeft <= 0) {
    return "истекло";
  }

  const totalMinutes = Math.floor(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes} мин`;
  }
  return "меньше минуты";
}
