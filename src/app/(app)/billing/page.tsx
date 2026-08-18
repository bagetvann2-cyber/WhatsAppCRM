import { redirect } from "next/navigation";
import { cancelInvoiceAction, confirmPaymentAction } from "@/app/(app)/billing/actions";
import { PlanCards } from "@/components/PlanCards";
import { TopUpForm } from "@/components/TopUpForm";
import { AlertIcon, LockIcon } from "@/components/icons";
import { Empty, Footnote, Group, GroupTitle, PageHead, Row, Table, Td, Th } from "@/components/ledger";
import { balanceLevel, daysLeft, money } from "@/lib/billing";
import {
  getSubscription,
  isSubscriptionActive,
  listInvoices,
  listOperations,
  listPlans,
} from "@/lib/billing-store";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageTeam, listMembers } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Тариф и баланс — WhatsApp CRM" };

const METHOD_LABEL: Record<string, string> = {
  kaspi: "Kaspi",
  bank: "безналичный расчёт",
};

const INVOICE_LABEL: Record<string, string> = {
  PENDING: "ждёт оплаты",
  PAID: "оплачен",
  CANCELLED: "отменён",
};

export default async function BillingPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const [subscription, plans, members, invoices, operations, fresh] = await Promise.all([
    getSubscription(organization.id),
    listPlans(),
    listMembers(organization.id),
    listInvoices(organization.id),
    listOperations(organization.id),
    prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
      select: { balance: true },
    }),
  ]);

  const active = isSubscriptionActive(subscription);
  const until = subscription.status === "ACTIVE" ? subscription.paidUntil : subscription.trialEndsAt;
  const left = daysLeft(until);
  const level = balanceLevel(fresh.balance);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="Тариф и баланс">
        Подписка оплачивает интерфейс, баланс — сами сообщения. Meta берёт деньги за доставленное
        сообщение, поэтому и мы списываем по факту доставки, а не отправки.
      </PageHead>

      <Group className="mt-0">
        <GroupTitle>Сейчас</GroupTitle>

        <Row
          label={subscription.plan.name}
          note={
            subscription.status === "TRIAL" && until === null
              ? "пробный период начнётся с первым сообщением клиента"
              : active
                ? `действует ещё ${left} дн.`
                : "срок вышел — рассылки остановлены, переписка работает"
          }
          value={active ? "оплачен" : "просрочен"}
          tone={active ? "accent" : "warn"}
        />

        <Row
          label="Баланс на сообщения"
          note={
            level === "empty"
              ? "рассылки не запустятся, пока баланс не пополнен"
              : level === "low"
                ? "низкий баланс — пополните до следующей рассылки"
                : "хватает на рассылки"
          }
          value={money(fresh.balance)}
          tone={level === "ok" ? "plain" : "warn"}
        />
      </Group>

      <Group>
        <GroupTitle>Пополнить</GroupTitle>
        <div className="pt-4">
          <TopUpForm />
        </div>
      </Group>

      <Group>
        <GroupTitle>Тарифы</GroupTitle>
        <div className="pt-4">
          <PlanCards
            plans={plans.map((plan) => ({
              code: plan.code,
              name: plan.name,
              monthlyPrice: plan.monthlyPrice,
              operatorsIncluded: plan.operatorsIncluded,
              extraOperatorPrice: plan.extraOperatorPrice,
              features: plan.features,
            }))}
            currentCode={subscription.plan.code}
            operators={members.length}
          />
        </div>
        <Footnote>
          В кабинете {members.length} сотрудников. Сверх включённых в тариф каждый считается
          отдельно — сумма в карточке уже с этой доплатой.
        </Footnote>
      </Group>

      <Group>
        <GroupTitle>Счета</GroupTitle>

        {invoices.length === 0 ? (
          <Empty>Счетов пока нет.</Empty>
        ) : (
          invoices.map((invoice) => (
            <Row
              key={invoice.id}
              label={`№${invoice.number} · ${invoice.description}`}
              note={`${METHOD_LABEL[invoice.method] ?? invoice.method} · ${INVOICE_LABEL[invoice.status]}`}
              tone={invoice.status === "PAID" ? "accent" : "plain"}
            >
              <span className="flex shrink-0 items-baseline gap-4">
                {invoice.status === "PENDING" && (
                  <>
                    {process.env.NODE_ENV !== "production" && (
                      <form action={confirmPaymentAction}>
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <button
                          type="submit"
                          className="text-xs text-accent transition-colors hover:underline"
                        >
                          Отметить оплаченным
                        </button>
                      </form>
                    )}
                    <form action={cancelInvoiceAction}>
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <button
                        type="submit"
                        className="text-xs text-ink-muted transition-colors hover:text-danger"
                      >
                        Отменить
                      </button>
                    </form>
                  </>
                )}
                <span
                  className={`text-lg leading-none font-semibold tabular-nums ${
                    invoice.status === "PAID" ? "text-accent" : "text-ink"
                  }`}
                >
                  {money(invoice.amount)}
                </span>
              </span>
            </Row>
          ))
        )}

        <Footnote icon={<LockIcon className="mt-0.5 size-3.5 shrink-0" />}>
          Приём оплаты пока не подключён: счёт выставляется и ждёт денег. Kaspi и банковский
          платёж встанут на это же место — им останется пометить счёт оплаченным.
          {process.env.NODE_ENV !== "production" &&
            " Кнопка «Отметить оплаченным» есть только в разработке."}
        </Footnote>
      </Group>

      <Group>
        <GroupTitle>История списаний</GroupTitle>

        {operations.length === 0 ? (
          <Empty>Движений по балансу пока не было.</Empty>
        ) : (
          <Table
            caption="История операций по балансу"
            head={
              <>
                <Th>Когда</Th>
                <Th>За что</Th>
                <Th numeric>Сумма</Th>
                <Th numeric>Остаток</Th>
              </>
            }
          >
            {operations.map((operation) => (
              <tr key={operation.id}>
                <Td>
                  <span className="text-ink-faint tabular-nums">
                    {operation.createdAt.toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Td>
                <Td>
                  <span className="text-ink-muted">{operation.description}</span>
                </Td>
                <td
                  className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                    operation.amount >= 0 ? "text-accent" : "text-ink"
                  }`}
                >
                  {operation.amount >= 0 ? "+" : "−"}
                  {money(Math.abs(operation.amount))}
                </td>
                <Td numeric>{money(operation.balanceAfter)}</Td>
              </tr>
            ))}
          </Table>
        )}

        {level !== "ok" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            Рассылка не запустится, если денег не хватает на всех получателей: половина клиентов
            с обрывком акции хуже, чем отложенная рассылка.
          </p>
        )}
      </Group>
    </main>
  );
}
