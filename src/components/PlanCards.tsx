"use client";

import { useActionState, useState } from "react";
import { subscribeAction, type BillingState } from "@/app/(app)/billing/actions";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { PERIODS, money, periodDiscount, subscriptionPrice } from "@/lib/billing";

export type PlanCard = {
  code: string;
  name: string;
  monthlyPrice: number;
  operatorsIncluded: number;
  extraOperatorPrice: number;
  features: string[];
};

/**
 * Выбор тарифа и периода. Цена пересчитывается на месте теми же формулами,
 * что считают счёт на сервере: клиент видит ровно ту сумму, что придёт.
 */
export function PlanCards({
  plans,
  currentCode,
  operators,
}: {
  plans: PlanCard[];
  currentCode: string | null;
  operators: number;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(subscribeAction, null);
  const [months, setMonths] = useState(1);

  const discount = periodDiscount(months);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-muted">Оплатить на</span>
        {PERIODS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMonths(value)}
            aria-pressed={value === months}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              value === months
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-panel-muted hover:text-ink"
            }`}
          >
            {value} мес
            {periodDiscount(value) > 0 && (
              <span className="ml-1 opacity-70">−{Math.round(periodDiscount(value) * 100)}%</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((plan) => {
          const price = subscriptionPrice(plan, months, operators);
          const current = plan.code === currentCode;

          return (
            <form
              key={plan.code}
              action={action}
              className={`flex flex-col rounded-xl border bg-panel p-4 ${
                current ? "border-accent" : "border-line"
              }`}
            >
              <input type="hidden" name="planCode" value={plan.code} />
              <input type="hidden" name="months" value={months} />
              <input type="hidden" name="operators" value={operators} />
              <input type="hidden" name="method" value="kaspi" />

              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-ink">{plan.name}</h3>
                {current && <span className="text-xs text-accent">текущий</span>}
              </div>

              <p className="mt-2 text-xl font-bold text-ink tabular-nums">
                {money(price.perMonth)}
                <span className="text-sm font-normal text-ink-faint"> / мес</span>
              </p>

              {plan.monthlyPrice > 0 && (
                <p className="mt-1 text-xs text-ink-faint tabular-nums">
                  за {months} мес — {money(price.total)}
                  {discount > 0 && <> · скидка {money(price.discount)}</>}
                </p>
              )}

              <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-ink-muted">
                    <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.monthlyPrice > 0 && (
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {pending ? "Выставляем счёт…" : "Выставить счёт"}
                </button>
              )}
            </form>
          );
        })}
      </div>

      {state && "error" in state && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state && "ok" in state && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{state.ok}</p>
      )}
    </div>
  );
}
