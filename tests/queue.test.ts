import { afterAll, expect, test } from "vitest";
import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/db";
import { enqueueProcessMessage, workProcessMessage, type ProcessMessageJob } from "@/lib/queue";

const RUN = `QTEST-${Date.now()}`;

function job(conversationId: string, n: number): ProcessMessageJob {
  return {
    messageId: `${RUN}-${conversationId}-${n}`,
    conversationId: `${RUN}-${conversationId}`,
    organizationId: "org",
    channelId: "ch",
    to: "77000000000",
    text: "привет",
    hasMedia: false,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
  const boss = (globalThis as unknown as { boss?: PgBoss }).boss;
  await boss?.stop({ graceful: false });
});

test("сообщения одного диалога идут по одному, разных диалогов — параллельно", async () => {
  // Задания, оставшиеся от вебхук-тестов (их некому обработать), задержали бы воркер.
  await prisma.$executeRaw`DELETE FROM pgboss.job WHERE name = 'process-message' AND state = 'created'`;
  const activeByConv = new Map<string, number>();
  let active = 0;
  let maxActive = 0;
  let maxInConv = 0;
  const done: string[] = [];

  await workProcessMessage(async (data) => {
    if (!data.conversationId.startsWith(RUN)) return; // хвосты других тестов
    active++;
    const inConv = (activeByConv.get(data.conversationId) ?? 0) + 1;
    activeByConv.set(data.conversationId, inConv);
    maxActive = Math.max(maxActive, active);
    maxInConv = Math.max(maxInConv, inConv);
    await new Promise((r) => setTimeout(r, 300));
    activeByConv.set(data.conversationId, inConv - 1);
    active--;
    done.push(data.messageId);
  });

  for (const conv of ["A", "B"]) {
    for (let n = 1; n <= 3; n++) await enqueueProcessMessage(job(conv, n));
  }

  const deadline = Date.now() + 30_000;
  while (done.length < 6 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));

  expect(done).toHaveLength(6);
  expect(maxInConv).toBe(1);
  expect(maxActive).toBeGreaterThanOrEqual(2);
}, 40_000);
