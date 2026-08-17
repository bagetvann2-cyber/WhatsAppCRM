import { redirect } from "next/navigation";
import { AiBotForm } from "@/components/AiBotForm";
import { AlertIcon } from "@/components/icons";
import { getBot, listReplies } from "@/lib/ai-bot-store";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { resetUsageAction } from "@/app/(app)/ai-bot/actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "ИИ-помощник — WhatsApp CRM" };

export default async function AiBotPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const [settings, replies] = await Promise.all([
    getBot(organization.id),
    listReplies(organization.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">ИИ-помощник</h1>
      <p className="mt-1.5 mb-8 max-w-2xl text-sm text-ink-muted">
        Отвечает клиентам по анкете компании и передаёт диалог человеку, когда вопрос выходит за её
        рамки. Каждый ответ виден в переписке как обычное исходящее — оператор всегда знает, что
        клиенту уже написали.
      </p>

      <AiBotForm
        initial={{
          enabled: settings.enabled,
          model: settings.model,
          companyProfile: settings.companyProfile,
          rules: settings.rules,
          answersLimit: settings.answersLimit,
          answersUsed: settings.answersUsed,
        }}
      />

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Что отвечал помощник</h2>
          {settings.answersUsed > 0 && (
            <form action={resetUsageAction}>
              <button
                type="submit"
                className="text-xs text-ink-muted transition-colors hover:text-ink"
              >
                Обнулить счётчик пакета
              </button>
            </form>
          )}
        </div>

        {replies.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
            Пока ничего. Здесь будет видно каждый ответ — и что именно спросил клиент.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {replies.map((reply) => (
              <li key={reply.id} className="rounded-xl border border-line bg-panel p-4">
                <p className="text-sm text-ink-muted">
                  <span className="text-ink-faint">Клиент:</span> {reply.question}
                </p>

                {reply.answer && (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-ink">
                    <span className="text-ink-faint">Помощник:</span> {reply.answer}
                  </p>
                )}

                {reply.handoff && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    Передал оператору: {reply.handoffReason ?? "без пояснения"}
                  </p>
                )}

                {reply.error && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    Ошибка: {reply.error}
                  </p>
                )}

                <p className="mt-2 text-xs text-ink-faint tabular-nums">
                  {reply.createdAt.toLocaleString("ru-RU")} · токенов: вход {reply.inputTokens}, из
                  кэша {reply.cachedTokens}, ответ {reply.outputTokens}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
