import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertIcon, CheckIcon, LockIcon } from "@/components/icons";
import { dashboard, workload } from "@/lib/analytics";
import { formatPhone } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Отчёты — WhatsApp CRM" };

const PERIODS = [7, 30] as const;

function Stat({
  label,
  value,
  hint,
  tone = "plain",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "plain" | "warn";
  href?: string;
}) {
  const body = (
    <>
      <span
        className={`block text-2xl font-bold tabular-nums ${
          tone === "warn" ? "text-warn" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="mt-0.5 block text-sm text-ink-muted">{label}</span>
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </>
  );

  const className = `rounded-xl border border-line bg-panel px-4 py-3.5 ${
    href ? "transition-colors hover:border-line-strong hover:bg-panel-muted" : ""
  }`;

  return href ? (
    <Link href={href} className={`block ${className}`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Минуты в читаемый вид: «7 мин», «1 ч 20 мин». */
function minutesLabel(minutes: number | null): string {
  if (minutes === null) {
    return "—";
  }
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const { days } = await searchParams;
  const period = days === "30" ? 30 : 7;

  const [stats, team] = await Promise.all([
    dashboard(organization.id),
    workload(organization.id, period),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Отчёты</h1>
      <p className="mt-1.5 mb-8 max-w-2xl text-sm text-ink-muted">
        Числа, на которые можно среагировать сегодня. Графиков здесь нет намеренно: владельцу
        нужен ответ на вопрос «всё ли в порядке», а не аналитическая панель.
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Сейчас</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="ждут ответа"
            value={stats.waitingReply}
            hint={stats.waitingReply > 0 ? "последнее слово за клиентом" : "все ответы даны"}
            tone={stats.waitingReply > 0 ? "warn" : "plain"}
            href="/"
          />
          <Stat
            label="окон 24 часа открыто"
            value={stats.openWindows}
            hint="можно писать свободно, без шаблона"
          />
          <Stat label="диалогов всего" value={stats.conversations} />
          <Stat label="контактов" value={stats.contacts} href="/contacts" />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-ink">Номер компании</h2>

        {stats.numbers.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
            Номер ещё не подключён. Без него кабинет не принимает и не отправляет сообщения.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stats.numbers.map((number) => (
              <li
                key={number.phoneNumberId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-panel px-4 py-3"
              >
                <span className="font-semibold text-ink tabular-nums">
                  {number.displayNumber ? formatPhone(number.displayNumber) : number.phoneNumberId}
                </span>

                {number.connected ? (
                  <span className="flex items-center gap-1.5 text-sm text-accent">
                    <CheckIcon className="size-4" />
                    подключён к кабинету Meta
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-warn">
                    <AlertIcon className="size-4" />
                    не привязан к WABA — шаблоны и рассылки не работают
                  </span>
                )}

                {number.qualityRating && (
                  <span className="text-xs text-ink-faint">
                    качество по оценке Meta: {number.qualityRating}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Работа команды</h2>
          <nav aria-label="Период" className="flex gap-1">
            {PERIODS.map((value) => (
              <Link
                key={value}
                href={value === 7 ? "/reports" : `/reports?days=${value}`}
                aria-current={value === period ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  value === period
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-panel-muted hover:text-ink"
                }`}
              >
                {value} дней
              </Link>
            ))}
          </nav>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="сообщений от клиентов" value={stats.inbound7d} hint="за 7 дней" />
          <Stat label="ответов отправлено" value={stats.outbound7d} hint="за 7 дней" />
          <Stat
            label="медиана времени ответа"
            value={minutesLabel(team.medianReplyMinutes)}
            hint={`обращений: ${team.answered}`}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <caption className="sr-only">Нагрузка операторов за {period} дней</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th scope="col" className="px-4 py-2.5 font-medium">Сотрудник</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Диалогов ведёт</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Ответов</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Отвечает за</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {team.rows.map((row) => (
                <tr key={row.userId}>
                  <td className="px-4 py-2.5 text-ink">{row.label}</td>
                  <td className="px-4 py-2.5 text-right text-ink-muted tabular-nums">
                    {row.assigned}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-muted tabular-nums">
                    {row.replies}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-muted tabular-nums">
                    {minutesLabel(row.medianReplyMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs text-ink-faint">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          Ответы автоответчика, ИИ-помощника и рассылок в таблицу не попадают: робот отвечает
          мгновенно и всегда, и рядом с ним живой оператор выглядел бы медленным.
        </p>
      </section>
    </main>
  );
}
