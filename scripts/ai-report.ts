/**
 * Расход на нейросети и скорость ответов: из журнала AiReply (переписка клиентов)
 * и AiUsage (генератор, тест-чат, проверка ключа). Бюджета нет, только потраченное.
 *
 *   npm run ai-report                        # с начала текущего месяца
 *   npm run ai-report -- --since 2026-09-01
 */
import { prisma } from "@/lib/db";
import { PROVIDER_INFO, costUsd } from "@/lib/llm/catalog";
import type { ProviderId } from "@/lib/llm/types";

type Row = { calls: number; input: number; cached: number; output: number; usd: number; unpriced: boolean };

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function main() {
  const now = new Date();
  const since = arg("since") ? new Date(arg("since")!) : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  if (Number.isNaN(since.getTime())) {
    console.error("--since: дата в формате ГГГГ-ММ-ДД");
    process.exitCode = 1;
    return;
  }

  const spend = new Map<string, Row>();
  function add(source: string, provider: ProviderId, model: string | null, input: number, cached: number, output: number) {
    const key = `${PROVIDER_INFO[provider].label} · ${model ?? "?"} · ${source}`;
    const row = spend.get(key) ?? { calls: 0, input: 0, cached: 0, output: 0, usd: 0, unpriced: false };
    const usd = model ? costUsd(provider, model, { input: input + cached, cached, output }) : null;
    row.calls += 1;
    row.input += input;
    row.cached += cached;
    row.output += output;
    if (usd === null) row.unpriced = true;
    else row.usd += usd;
    spend.set(key, row);
  }

  const replies = await prisma.aiReply.findMany({
    where: { createdAt: { gte: since }, provider: { not: null }, stub: false },
    select: { organizationId: true, provider: true, model: true, inputTokens: true, cachedTokens: true, outputTokens: true, latencyMs: true },
  });
  for (const r of replies) add("переписка", r.provider!, r.model, r.inputTokens, r.cachedTokens, r.outputTokens);

  const usage = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: since }, provider: { not: null } },
    select: { kind: true, provider: true, model: true, inputTokens: true, outputTokens: true },
  });
  // В AiUsage кэш не хранится: входные токены считаются по полной цене.
  for (const u of usage) add(u.kind.toLowerCase(), u.provider!, u.model, u.inputTokens, 0, u.outputTokens);

  console.log(`Расход с ${since.toISOString().slice(0, 10)}\n`);
  console.log("нейросеть · модель · откуда".padEnd(60), "вызовы".padStart(7), "вход".padStart(9), "кэш".padStart(9), "выход".padStart(8), "USD".padStart(9));
  let total = 0;
  for (const [key, r] of [...spend].sort()) {
    total += r.usd;
    const usd = r.unpriced ? `${r.usd.toFixed(4)}+?` : r.usd.toFixed(4);
    console.log(key.padEnd(60), String(r.calls).padStart(7), String(r.input).padStart(9), String(r.cached).padStart(9), String(r.output).padStart(8), usd.padStart(9));
  }
  console.log(`${"Итого".padEnd(60)} ${"".padStart(7)} ${"".padStart(9)} ${"".padStart(9)} ${"".padStart(8)} ${total.toFixed(4).padStart(9)}`);

  const byOrg = new Map<string, number[]>();
  for (const r of replies) {
    if (r.latencyMs !== null) byOrg.set(r.organizationId, [...(byOrg.get(r.organizationId) ?? []), r.latencyMs]);
  }
  const names = new Map(
    (await prisma.organization.findMany({ where: { id: { in: [...byOrg.keys()] } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]),
  );

  console.log("\nВремя до первого ответа, мс\n");
  console.log("организация".padEnd(40), "ответов".padStart(8), "медиана".padStart(9), "p90".padStart(8));
  for (const [org, list] of byOrg) {
    const sorted = list.sort((a, b) => a - b);
    console.log((names.get(org) ?? org).slice(0, 39).padEnd(40), String(sorted.length).padStart(8), String(percentile(sorted, 0.5)).padStart(9), String(percentile(sorted, 0.9)).padStart(8));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
