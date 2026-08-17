import { expect, test } from "vitest";
import { median, responseTimes, type Turn } from "@/lib/analytics";

function turn(
  conversationId: string,
  direction: "INBOUND" | "OUTBOUND",
  minute: number,
  authorId: string | null = null,
): Turn {
  return {
    conversationId,
    direction,
    authorId,
    timestamp: new Date(Date.UTC(2026, 7, 18, 9, minute)),
  };
}

test("медиана устойчива к одному забытому диалогу", () => {
  expect(median([2, 4, 6])).toBe(4);
  expect(median([2, 4, 6, 8])).toBe(5);
  // Среднее здесь было бы 152 минуты, медиана показывает правду про типичный ответ
  expect(median([3, 5, 7, 600])).toBe(6);
  expect(median([])).toBeNull();
});

test("три сообщения клиента подряд — одно обращение, а не три", () => {
  const { all } = responseTimes([
    turn("c1", "INBOUND", 0),
    turn("c1", "INBOUND", 2),
    turn("c1", "INBOUND", 3),
    turn("c1", "OUTBOUND", 10, "operator"),
  ]);

  // Ждём от первого сообщения, а не от последнего: клиент ждёт именно столько
  expect(all).toEqual([10]);
});

test("каждое новое обращение считается заново", () => {
  const { all } = responseTimes([
    turn("c1", "INBOUND", 0),
    turn("c1", "OUTBOUND", 5, "operator"),
    turn("c1", "INBOUND", 20),
    turn("c1", "OUTBOUND", 26, "operator"),
  ]);

  expect(all).toEqual([5, 6]);
});

test("исходящее без обращения в статистику не идёт", () => {
  const { all } = responseTimes([
    turn("c1", "OUTBOUND", 0, "operator"),
    turn("c1", "OUTBOUND", 5, "operator"),
  ]);

  expect(all).toEqual([]);
});

test("ответ робота закрывает обращение, но в нагрузку оператора не идёт", () => {
  const { all, byAuthor } = responseTimes([
    turn("c1", "INBOUND", 0),
    turn("c1", "OUTBOUND", 1, null),
    turn("c2", "INBOUND", 0),
    turn("c2", "OUTBOUND", 9, "operator"),
  ]);

  expect(all).toEqual([1, 9]);
  expect(byAuthor.get("operator")).toEqual([9]);
  expect(byAuthor.has("")).toBe(false);
});

test("диалоги считаются независимо и в порядке времени", () => {
  const { all, byAuthor } = responseTimes([
    turn("c2", "OUTBOUND", 12, "asel"),
    turn("c1", "INBOUND", 0),
    turn("c2", "INBOUND", 4),
    turn("c1", "OUTBOUND", 3, "erzhan"),
  ]);

  expect(all.sort((a, b) => a - b)).toEqual([3, 8]);
  expect(byAuthor.get("erzhan")).toEqual([3]);
  expect(byAuthor.get("asel")).toEqual([8]);
});
