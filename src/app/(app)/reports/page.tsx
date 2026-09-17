import Link from "next/link";
import { redirect } from "next/navigation";
import { LockIcon } from "@/components/icons";
import { Empty, Footnote, Group, GroupTitle, PageHead, Row, Table, Td, Th } from "@/components/ledger";
import { dashboard, workload } from "@/lib/analytics";
import { formatPhone } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Отчёты — WhatsApp CRM" };

const PERIODS = [7, 30] as const;

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
    redirect("/inbox");
  }

  const { days } = await searchParams;
  const period = days === "30" ? 30 : 7;

  const [stats, team] = await Promise.all([
    dashboard(organization.id),
    workload(organization.id, period),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="Отчёты">
        Числа, на которые можно среагировать сегодня. Графиков здесь нет намеренно: владельцу
        нужен ответ на вопрос «всё ли в порядке», а не аналитическая панель.
      </PageHead>

      <Group className="mt-0">
        <GroupTitle>Требует внимания</GroupTitle>
        <Row
          label="Ждут ответа"
          note={stats.waitingReply > 0 ? "последнее слово за клиентом" : "все ответы даны"}
          value={stats.waitingReply}
          tone={stats.waitingReply > 0 ? "warn" : "plain"}
          href="/inbox"
        />
        <Row
          label="Окон 24 часа открыто"
          note="этим клиентам можно писать свободно, без шаблона"
          value={stats.openWindows}
        />
      </Group>

      <Group>
        <GroupTitle>Всего в кабинете</GroupTitle>
        <Row label="Диалогов" value={stats.conversations} />
        <Row label="Контактов" value={stats.contacts} href="/contacts" />

        {stats.numbers.length === 0 ? (
          <Empty>
            Номер ещё не подключён. Без него кабинет не принимает и не отправляет сообщения.
          </Empty>
        ) : (
          stats.numbers.map((number) => (
            <Row
              key={number.channelId}
              label={
                number.displayNumber
                  ? formatPhone(number.displayNumber)
                  : (number.phoneNumberId ?? "Номер WhatsApp")
              }
              note={
                number.connected
                  ? "номер подключён к кабинету Meta"
                  : "не привязан к WABA — шаблоны и рассылки не работают"
              }
              value={number.connected ? "готов" : "нужна настройка"}
              tone={number.connected ? "accent" : "warn"}
            />
          ))
        )}
      </Group>

      <Group>
        <GroupTitle
          aside={
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
          }
        >
          За {period} дней
        </GroupTitle>

        <Row label="Сообщений от клиентов" value={stats.inbound7d} />
        <Row label="Ответов отправлено" value={stats.outbound7d} />
        <Row
          label="Медиана времени ответа"
          note={`обращений: ${team.answered}`}
          value={minutesLabel(team.medianReplyMinutes)}
        />
      </Group>

      <Group>
        <GroupTitle>Кто сколько отвечает</GroupTitle>

        <Table
          caption={`Нагрузка операторов за ${period} дней`}
          head={
            <>
              <Th>Сотрудник</Th>
              <Th numeric>Ведёт</Th>
              <Th numeric>Ответов</Th>
              <Th numeric>Отвечает за</Th>
            </>
          }
        >
          {team.rows.map((row) => (
            <tr key={row.userId}>
              <Td>{row.label}</Td>
              <Td numeric>{row.assigned}</Td>
              <Td numeric>{row.replies}</Td>
              <Td numeric>{minutesLabel(row.medianReplyMinutes)}</Td>
            </tr>
          ))}
        </Table>

        <Footnote icon={<LockIcon className="mt-0.5 size-3.5 shrink-0" />}>
          Ответы автоответчика, ИИ-помощника и рассылок в таблицу не попадают: робот отвечает
          мгновенно и всегда, и рядом с ним живой оператор выглядел бы медленным.
        </Footnote>
      </Group>
    </main>
  );
}
