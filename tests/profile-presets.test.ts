import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PROFILE_PRESETS, findPlaceholders } from "@/lib/profile-presets";
import { getBot } from "@/lib/ai-bot-store";
import { getOrderFields, saveOrderFields } from "@/lib/orders-store";
import { createTestOrg, dropTestOrg } from "./helpers";

const PNID = "PNID-PRESETS";
let organizationId: string;

const requireUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ requireUser: requireUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(async () => {
  await dropTestOrg(PNID);
  organizationId = (await createTestOrg(PNID)).id;
  requireUserMock.mockResolvedValue({ organization: { id: organizationId }, role: "OWNER" });
});

afterAll(async () => {
  await dropTestOrg(PNID);
  await prisma.$disconnect();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

test("у каждой готовой анкеты есть текст, правила и корректные поля заказа", () => {
  expect(new Set(PROFILE_PRESETS.map((p) => p.id)).size).toBe(PROFILE_PRESETS.length);
  for (const preset of PROFILE_PRESETS) {
    expect(preset.companyProfile.trim(), preset.id).not.toBe("");
    expect(preset.rules.trim(), preset.id).not.toBe("");
    expect(preset.orderFields.length, preset.id).toBeGreaterThan(0);
    for (const field of preset.orderFields) {
      expect(field.label.trim(), preset.id).not.toBe("");
      if (field.type === "SELECT") expect(field.options?.length, `${preset.id}: ${field.label}`).toBeGreaterThan(1);
    }
  }
});

test("места «[уточните: …]» находятся и в анкете, и в правилах", () => {
  expect(findPlaceholders("цена [уточните: цена доставки], [уточните: адрес]", "ок")).toHaveLength(2);
  expect(findPlaceholders("всё заполнено", "[уточните: что-то]")).toHaveLength(1);
  expect(findPlaceholders("[уточните", "уточните: ]")).toHaveLength(0);
});

test("с незаполненными местами включить помощника нельзя, выключенного — сохраняем", async () => {
  const { saveBotAction } = await import("@/app/(app)/ai-bot/actions");
  const profile = "Цена [уточните: цена]";

  const refused = await saveBotAction(null, form({ companyProfile: profile, enabled: "on" }));
  expect(refused).toMatchObject({ error: expect.stringContaining("1") });
  expect((await getBot(organizationId)).exists).toBe(false);

  const saved = await saveBotAction(null, form({ companyProfile: profile }));
  expect(saved).toMatchObject({ ok: expect.stringContaining("не включён") });
  expect((await getBot(organizationId)).enabled).toBe(false);
});

test("поля заказа из готовой анкеты создаются, только если своих ещё нет", async () => {
  const { saveBotAction } = await import("@/app/(app)/ai-bot/actions");
  const data = { companyProfile: "Пиццерия", presetId: "food", applyOrderFields: "on" };

  await saveBotAction(null, form(data));
  const created = await getOrderFields(organizationId);
  expect(created.map((f) => f.label)).toContain("Адрес доставки");

  await saveOrderFields(organizationId, [{ label: "Моё поле", type: "TEXT", options: null, required: false }]);
  await saveBotAction(null, form(data));
  expect((await getOrderFields(organizationId)).map((f) => f.label)).toEqual(["Моё поле"]);
});
