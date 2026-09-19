import { redirect } from "next/navigation";
import { AiBotForm } from "@/components/AiBotForm";
import { AiProviderCard } from "@/components/AiProviderCard";
import { env } from "@/lib/env";
import { PROVIDERS } from "@/lib/llm/types";
import { AlertIcon } from "@/components/icons";
import { Empty, Group, GroupTitle, PageHead } from "@/components/ledger";
import { REASON_LABEL } from "@/lib/ai-bot";
import { countUsage, getBot, listReplies } from "@/lib/ai-bot-store";
import { GENERATOR_LIMIT } from "@/lib/profile-generator";
import { getOrderFields } from "@/lib/orders-store";
import { PROVIDER_INFO, findModel } from "@/lib/llm/catalog";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "ИИ-помощник — WhatsApp CRM" };

export default async function AiBotPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/inbox");
  }

  const [settings, replies, orderFields] = await Promise.all([
    getBot(organization.id),
    listReplies(organization.id),
    getOrderFields(organization.id),
  ]);
  const generatorUsed = await countUsage(organization.id, "GENERATOR", settings.trialNotStarted);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="ИИ-помощник">
        Отвечает клиентам по анкете компании и передаёт диалог человеку, когда вопрос выходит за её
        рамки. Каждый ответ виден в переписке как обычное исходящее — оператор всегда знает, что
        клиенту уже написали.
      </PageHead>

      <AiBotForm
        provider={settings.provider}
        usesOwnKey={settings.usesOwnKey === true}
        initial={{
          enabled: settings.enabled,
          model: settings.model,
          companyProfile: settings.companyProfile,
          rules: settings.rules,
          answersLimit: settings.answersLimit,
          answersUsed: settings.answersUsed,
          resetsAt: settings.periodResetsAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
          stubText: settings.stubText ?? null,
          stubTextKz: settings.stubTextKz ?? null,
          hasOrderFields: orderFields.length > 0,
          generatorLeft: Math.max(0, GENERATOR_LIMIT - generatorUsed),
          generatorLimit: GENERATOR_LIMIT,
          canGenerate: settings.subscriptionActive,
        }}
      />

      <div className="mt-6">
        <AiProviderCard
          provider={settings.provider}
          model={settings.model}
          ownKey={
            settings.ownKey && {
              provider: settings.ownKey.provider,
              hint: settings.ownKey.hint,
              checkedAt: settings.ownKey.checkedAt?.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) ?? null,
              error: settings.ownKey.error,
            }
          }
          platformProviders={PROVIDERS.filter((p) => !PROVIDER_INFO[p].ownKeyOnly && env.platformKey(p))}
        />
      </div>

      <Group className="mt-12">
        <GroupTitle>
          Что отвечал помощник
        </GroupTitle>

        {replies.length === 0 ? (
          <Empty>Пока ничего. Здесь будет видно каждый ответ — и что именно спросил клиент.</Empty>
        ) : (
          <ul>
            {replies.map((reply) => (
              <li key={reply.id} className="border-b border-line py-3.5 last:border-b-0">
                <p className="text-sm text-ink-muted">
                  <span className="text-ink-faint">Клиент:</span> {reply.question}
                </p>

                {reply.answer && (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-ink">
                    <span className="text-ink-faint">{reply.stub ? "Заглушка:" : "Помощник:"}</span> {reply.answer}
                  </p>
                )}

                {reply.stub && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    Отправлена заглушка: {REASON_LABEL[reply.outcome ?? ""] ?? "помощник не смог ответить"}
                  </p>
                )}

                {reply.handoff && !reply.stub && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    Передал оператору: {reply.handoffReason ?? "без пояснения"}
                  </p>
                )}

                {reply.error && !reply.stub && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    {REASON_LABEL[reply.outcome ?? ""] ?? "Ошибка"}: {reply.error}
                  </p>
                )}

                <p className="mt-2 text-xs text-ink-faint tabular-nums">
                  {reply.createdAt.toLocaleString("ru-RU")}
                  {reply.provider && reply.model && (
                    <> · {findModel(reply.provider, reply.model)?.label ?? `${PROVIDER_INFO[reply.provider].label} ${reply.model}`}</>
                  )}
                  {reply.ownKey && <> · ваш ключ</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </main>
  );
}
