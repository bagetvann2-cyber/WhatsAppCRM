import { expect, test } from "vitest";
import { assistantBanner, type BotSettings } from "@/lib/ai-bot";

const settings: BotSettings = {
  enabled: true,
  model: "claude-sonnet-5",
  companyProfile: "Пиццерия",
  rules: null,
  answersLimit: 100,
  answersUsed: 10,
};
const ok = { settings, subscriptionActive: true, hasChannel: true, lastOutcome: "answered", resetsAt: new Date(2026, 9, 19) };

test("всё в порядке или бот выключен — полосы нет", () => {
  expect(assistantBanner(ok)).toBeNull();
  expect(assistantBanner({ ...ok, settings: { ...settings, enabled: false }, hasChannel: false })).toBeNull();
});

test("каждая причина молчания называется и ведёт к действию", () => {
  expect(assistantBanner({ ...ok, hasChannel: false })?.action?.href).toBe("/channels");
  expect(assistantBanner({ ...ok, subscriptionActive: false })).toMatchObject({ text: expect.stringContaining("подписка не оплачена"), action: { href: "/billing" } });
  expect(assistantBanner({ ...ok, settings: { ...settings, answersUsed: 100 } })).toMatchObject({ text: expect.stringContaining("пакет ответов исчерпан"), tone: "error" });
  expect(assistantBanner({ ...ok, lastOutcome: "llm-auth" })).toMatchObject({ tone: "error" });
});

test("80% пакета — предупреждение с датой обновления", () => {
  const banner = assistantBanner({ ...ok, settings: { ...settings, answersUsed: 80 } });
  expect(banner).toMatchObject({ tone: "warn", action: { href: "/billing" } });
  expect(banner?.text).toContain("20 из 100");
  expect(banner?.text).toContain("19.10");
});

test("старая заглушка про пакет или подписку баннер не держит", () => {
  expect(assistantBanner({ ...ok, lastOutcome: "quota" })).toBeNull();
  expect(assistantBanner({ ...ok, lastOutcome: "subscription" })).toBeNull();
});
