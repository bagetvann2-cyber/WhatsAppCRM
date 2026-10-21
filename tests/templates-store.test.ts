import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { applyTemplateUpdate } from "@/lib/templates-store";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneA = "PNID-TPLSTORE-A";
const phoneB = "PNID-TPLSTORE-B";
let orgA: string;
let orgB: string;

async function makeTemplate(organizationId: string, metaId: string | null = null) {
  return prisma.messageTemplate.create({
    data: {
      organizationId,
      name: "privet_klient",
      language: "ru",
      category: "UTILITY",
      bodyText: "Здравствуйте",
      examples: [],
      status: "PENDING",
      metaId,
    },
  });
}

const update = { metaId: "META-1", name: "privet_klient", language: "ru", event: "APPROVED", reason: null };

beforeEach(async () => {
  await dropTestOrg(phoneA);
  await dropTestOrg(phoneB);
  orgA = (await createTestOrg(phoneA)).id;
  orgB = (await createTestOrg(phoneB)).id;
});

afterAll(async () => {
  await dropTestOrg(phoneA);
  await dropTestOrg(phoneB);
  await prisma.$disconnect();
});

test("одинаковое имя у двух компаний: вебхук без совпадения по metaId не меняет ни одну", async () => {
  const a = await makeTemplate(orgA);
  const b = await makeTemplate(orgB);

  await applyTemplateUpdate(update);

  expect((await prisma.messageTemplate.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
  expect((await prisma.messageTemplate.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PENDING");
});

test("единственный шаблон без metaId находится по имени и получает metaId", async () => {
  const a = await makeTemplate(orgA);

  await applyTemplateUpdate(update);

  const fresh = await prisma.messageTemplate.findUniqueOrThrow({ where: { id: a.id } });
  expect(fresh.status).toBe("APPROVED");
  expect(fresh.metaId).toBe("META-1");
});

test("совпадение по metaId применяется только к своему шаблону", async () => {
  const a = await makeTemplate(orgA, "META-1");
  const b = await makeTemplate(orgB);

  await applyTemplateUpdate(update);

  expect((await prisma.messageTemplate.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("APPROVED");
  expect((await prisma.messageTemplate.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PENDING");
});
