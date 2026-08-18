import { redirect } from "next/navigation";
import { BroadcastForm } from "@/components/BroadcastForm";
import { AlertIcon } from "@/components/icons";
import { Empty, Group, GroupTitle, PageHead } from "@/components/ledger";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { countByStatus, countUnsubscribes, listBroadcasts } from "@/lib/broadcasts";
import { listTags } from "@/lib/contacts";

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

  const [templates, contactCount, broadcasts, tags] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { organizationId: organization.id, status: "APPROVED" },
      orderBy: { name: "asc" },
    }),
    prisma.contact.count({ where: { organizationId: organization.id } }),
    listBroadcasts(organization.id),
    listTags(organization.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="Рассылки">
        Отправка по одобренному шаблону всем контактам или их части. Стоимость считается до
        запуска — деньги списываются за доставленные сообщения.
      </PageHead>

      <Group className="mt-0">
        <GroupTitle>Новая рассылка</GroupTitle>
        <div className="pt-4">
        <BroadcastForm
          contactCount={contactCount}
          tags={tags.map((t) => ({ id: t.id, name: t.name, count: t._count.contacts }))}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            bodyText: t.bodyText,
            examples: t.examples,
          }))}
        />
        </div>
      </Group>

      <Group className="mt-12">
        <GroupTitle>История</GroupTitle>

        {broadcasts.length === 0 ? (
          <Empty>Рассылок ещё не было.</Empty>
        ) : (
          <ul>
            {broadcasts.map((broadcast) => {
              const counts = countByStatus(broadcast.recipients);
              const total = broadcast.recipients.length;
              const reached = counts.SENT + counts.DELIVERED + counts.READ;

              return (
                <li key={broadcast.id} className="border-b border-line py-4 last:border-b-0">
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

                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                    {[
                      ["Получателей", total],
                      ["Отправлено", reached],
                      ["Доставлено", counts.DELIVERED + counts.READ],
                      ["Прочитано", counts.READ],
                      ["Ошибок", counts.FAILED],
                      ["Отписок", countUnsubscribes(broadcast.recipients, broadcast.startedAt)],
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
      </Group>
    </main>
  );
}
