import Link from "next/link";
import { redirect } from "next/navigation";
import { TemplateEditor } from "@/components/TemplateEditor";
import { AlertIcon, BackIcon } from "@/components/icons";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { statusLabel } from "@/lib/templates";
import { listTemplates } from "@/lib/templates-store";
import { deleteTemplateAction, sendForReviewAction } from "@/app/(app)/templates/actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Шаблоны — WhatsApp CRM" };

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-panel-muted text-ink-muted",
  PENDING: "bg-warn-soft text-warn",
  APPROVED: "bg-accent-soft text-accent",
  REJECTED: "bg-danger-soft text-danger",
  PAUSED: "bg-warn-soft text-warn",
  DISABLED: "bg-danger-soft text-danger",
};

export default async function TemplatesPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const templates = await listTemplates(organization.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Шаблоны сообщений</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
        Написать клиенту первым — или ответить, когда прошло больше 24 часов, — можно только
        одобренным шаблоном. Модерация Meta занимает от нескольких минут до суток.
      </p>

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-ink">Новый шаблон</h2>
        <TemplateEditor />
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          Ваши шаблоны {templates.length > 0 && <span className="text-ink-faint">· {templates.length}</span>}
        </h2>

        {templates.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
            Пока ни одного. Первый шаблон обычно самый нужный — подтверждение записи или заказа.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {templates.map((template) => (
              <li key={template.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{template.name}</p>
                    <p className="text-xs text-ink-faint">
                      {template.language} · {template.category.toLowerCase()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLE[template.status] ?? "bg-panel-muted text-ink-muted"
                    }`}
                  >
                    {statusLabel(template.status)}
                  </span>
                </div>

                <p className="mt-3 text-sm whitespace-pre-wrap text-ink-muted">{template.bodyText}</p>

                {template.rejectedReason && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    Причина отказа от Meta: {template.rejectedReason}. Исправьте текст и отправьте
                    заново.
                  </p>
                )}

                <div className="mt-4 flex items-center gap-3">
                  {(template.status === "DRAFT" || template.status === "REJECTED") && (
                    <form action={sendForReviewAction}>
                      <input type="hidden" name="id" value={template.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
                      >
                        Отправить на модерацию
                      </button>
                    </form>
                  )}

                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="id" value={template.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-muted transition-colors hover:text-danger"
                    >
                      Удалить
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
