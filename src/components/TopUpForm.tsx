"use client";

import { useActionState, useState } from "react";
import { topUpAction, type BillingState } from "@/app/(app)/billing/actions";
import { AlertIcon } from "@/components/icons";
import { PRICE_PER_MESSAGE } from "@/lib/pricing";
import { money } from "@/lib/billing";

const PRESETS = [10000, 25000, 50000];

/** Пополнение баланса на сообщения. Счёт выставляется, деньги ждут оплаты. */
export function TopUpForm() {
  const [state, action, pending] = useActionState<BillingState, FormData>(topUpAction, null);
  const [amount, setAmount] = useState("25000");

  const value = Number(amount) || 0;
  const marketing = Math.floor(value / PRICE_PER_MESSAGE.MARKETING);
  const utility = Math.floor(value / PRICE_PER_MESSAGE.UTILITY);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <p className="text-sm font-semibold text-ink">Пополнить баланс</p>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(String(preset))}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              String(preset) === amount
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-panel-muted hover:text-ink"
            }`}
          >
            {money(preset)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Сумма пополнения в тенге</span>
          <input
            name="amount"
            type="number"
            min={1000}
            step={1000}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong focus:border-accent focus:bg-panel"
          />
        </label>

        <label className="sm:w-44">
          <span className="sr-only">Способ оплаты</span>
          <select
            name="method"
            defaultValue="kaspi"
            className="w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong focus:border-accent focus:bg-panel"
          >
            <option value="kaspi">Kaspi</option>
            <option value="bank">Счёт на ТОО или ИП</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Выставляем…" : "Выставить счёт"}
        </button>
      </div>

      <p className="text-xs text-ink-faint tabular-nums">
        Хватит примерно на {marketing.toLocaleString("ru-RU")} рекламных или{" "}
        {utility.toLocaleString("ru-RU")} служебных сообщений. Деньги списываются за доставленные,
        а не за отправленные.
      </p>

      {state && "error" in state && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state && "ok" in state && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{state.ok}</p>
      )}
    </form>
  );
}
