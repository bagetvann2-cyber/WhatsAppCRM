import { redirect } from "next/navigation";
import { cancelInvoiceAction, confirmPaymentAction } from "@/app/(app)/billing/actions";
import { PlanCards } from "@/components/PlanCards";
import { TopUpForm } from "@/components/TopUpForm";
import { AlertIcon, LockIcon } from "@/components/icons";
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
      <h1 className="text-2xl font-bold tracking-tight text-ink">Тариф и баланс</h1>
      <p className="mt-1.5 mb-8 max-w-2xl text-sm text-ink-muted">
        Подписка оплачивает интерфейс, баланс — сами сообщения. Meta берёт деньги за доставленное
        сообщение, поэтому и мы списываем по факту доставки, а не отправки.
      </p>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
          <p className="text-sm text-ink-muted">Тариф</p>
          <p className="mt-0.5 text-lg font-bold text-ink">{subscription.plan.name}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {subscription.status === "TRIAL" && until === null
              ? "пробный период начнётся с первым сообщением клиента"
              : active
                ? `действует ещё ${left} дн.`
                : "срок вышел — рассылки остановлены, переписка работает"}
          </p>
        </div>

        <div
          className={`rounded-xl border px-4 py-3.5 ${
            level === "ok" ? "border-line bg-panel" : "border-warn/40 bg-warn-soft"
          }`}
        >
          <p className={`text-sm ${level === "ok" ? "text-ink-muted" : "text-warn"}`}>
            Баланс на сообщения
          </p>
          <p
            className={`mt-0.5 text-lg font-bold tabular-nums ${
              level === "ok" ? "text-ink" : "text-warn"
            }`}
          >
            {money(fresh.balance)}
          </p>
          <p className={`mt-1 text-xs ${level === "ok" ? "text-ink-faint" : "text-warn"}`}>
            {level === "empty"
              ? "рассылки не запустятся, пока баланс не пополнен"
              : level === "low"
                ? "низкий баланс — пополните до следующей рассылки"
                : "хватает на рассылки"}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <TopUpForm />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-ink">Тарифы</h2>
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
        <p className="mt-3 text-xs text-ink-faint">
          В кабинете {members.length} сотрудников. Сверх включённых в тариф каждый считается
          отдельно — сумма в карточке уже с этой доплатой.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-ink">Счета</h2>

        {invoices.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
            Счетов пока нет.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-panel px-4 py-3"
              >
                <span className="font-medium text-ink tabular-nums">№{invoice.number}</span>
                <span className="min-w-0 flex-1 text-sm text-ink-muted">
                  {invoice.description} · {METHOD_LABEL[invoice.method] ?? invoice.method}
                </span>
                <span className="font-semibold text-ink tabular-nums">{money(invoice.amount)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    invoice.status === "PAID"
                      ? "bg-accent-soft text-accent"
                      : invoice.status === "PENDING"
                        ? "bg-warn-soft text-warn"
                        : "bg-panel-muted text-ink-faint"
                  }`}
                >
                  {INVOICE_LABEL[invoice.status]}
                </span>

                {invoice.status === "PENDING" && (
                  <span className="flex items-center gap-3">
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
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 flex items-start gap-2 text-xs text-ink-faint">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          Приём оплаты пока не подключён: счёт выставляется и ждёт денег. Kaspi и банковский
          платёж встанут на это же место — им останется пометить счёт оплаченным.
          {process.env.NODE_ENV !== "production" && " Кнопка «Отметить оплаченным» есть только в разработке."}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-ink">История списаний</h2>

        {operations.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-ink-muted">
            Движений по балансу пока не было.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-sm">
              <caption className="sr-only">История операций по балансу</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium">Когда</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">За что</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Сумма</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Остаток</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {operations.map((operation) => (
                  <tr key={operation.id}>
                    <td className="px-4 py-2.5 text-ink-faint tabular-nums">
                      {operation.createdAt.toLocaleString("ru-RU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{operation.description}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                        operation.amount >= 0 ? "text-accent" : "text-ink"
                      }`}
                    >
                      {operation.amount >= 0 ? "+" : "−"}
                      {money(Math.abs(operation.amount))}
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-muted tabular-nums">
                      {money(operation.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {level !== "ok" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            Рассылка не запустится, если денег не хватает на всех получателей: половина клиентов
            с обрывком акции хуже, чем отложенная рассылка.
          </p>
        )}
      </section>
    </main>
  );
}
