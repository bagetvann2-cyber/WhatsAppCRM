import Link from "next/link";
import { redirect } from "next/navigation";
import { BroadcastForm } from "@/components/BroadcastForm";
import { AlertIcon, BackIcon } from "@/components/icons";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { countByStatus, listBroadcasts } from "@/lib/broadcasts";

export const dynamic = "force-dynamic";

export const metadata = { title: "Рассылки — WhatsApp CRM" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "черновик",
  RUNNING: "идёт отправка",
  DONE: "завершена",
  STOPPED: "остановлена",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-panel-muted text-ink-muted",
  RUNNING: "bg-warn-soft text-warn",
  DONE: "bg-accent-soft text-accent",
  STOPPED: "bg-danger-soft text-danger",
};

export default async function BroadcastsPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const [templates, contactCount, broadcasts] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { organizationId: organization.id, status: "APPROVED" },
      orderBy: { name: "asc" },
    }),
    prisma.contact.count({ where: { organizationId: organization.id } }),
    listBroadcasts(organization.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <BackIcon className="size-4" />К диалогам
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Рассылки</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
        Отправка по одобренному шаблону всем контактам или их части. Стоимость считается до
        запуска — деньги списываются за доставленные сообщения.
      </p>

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-ink">Новая рассылка</h2>
        <BroadcastForm
          contactCount={contactCount}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            bodyText: t.bodyText,
            examples: t.examples,
          }))}
        />
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-sm font-semibold text-ink">История</h2>

        {broadcasts.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
            Рассылок ещё не было.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {broadcasts.map((broadcast) => {
              const counts = countByStatus(broadcast.recipients);
              const total = broadcast.recipients.length;
              const reached = counts.SENT + counts.DELIVERED + counts.READ;

              return (
                <li key={broadcast.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{broadcast.name}</p>
                      <p className="text-xs text-ink-faint">
                        шаблон {broadcast.template.name} ·{" "}
                        {broadcast.segmentQuery ? `фильтр «${broadcast.segmentQuery}»` : "все контакты"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_STYLE[broadcast.status]
                      }`}
                    >
                      {STATUS_LABEL[broadcast.status]}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      ["Получателей", total],
                      ["Отправлено", reached],
                      ["Доставлено", counts.DELIVERED + counts.READ],
                      ["Прочитано", counts.READ],
                      ["Ошибок", counts.FAILED],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <dt className="text-xs text-ink-faint">{label}</dt>
                        <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  {broadcast.stoppedReason && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                      <AlertIcon className="mt-0.5 size-4 shrink-0" />
                      {broadcast.stoppedReason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
