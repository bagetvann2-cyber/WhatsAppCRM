"use client";

import { useActionState, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { saveOrderFieldsAction, type FormState } from "@/app/(app)/orders/actions";
import { ORDER_FIELD_TYPES, type OrderFieldDef, type OrderFieldType } from "@/lib/orders";

const INPUT =
  "rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";

type Draft = {
  id?: string;
  label: string;
  type: OrderFieldType;
  options: string;
  required: boolean;
};

function toDraft(field: OrderFieldDef): Draft {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    options: field.options?.join(", ") ?? "",
    required: field.required,
  };
}

export function OrderFieldsForm({ initial }: { initial: OrderFieldDef[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveOrderFieldsAction, null);
  const [open, setOpen] = useState(initial.length === 0);
  const [fields, setFields] = useState<Draft[]>(initial.map(toDraft));

  function patch(index: number, next: Partial<Draft>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...next } : f)));
  }

  function remove(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    setFields((prev) => [...prev, { label: "", type: "TEXT", options: "", required: false }]);
  }

  const payload = JSON.stringify(
    fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      options: f.options.split(",").map((o) => o.trim()).filter(Boolean),
      required: f.required,
    })),
  );

  if (!open) {
    return (
      <div className="mb-8 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-4">
        <p className="text-sm text-ink-muted">
          {initial.length === 0
            ? "Поля заказа не настроены — бот пока не сможет ничего сохранить."
            : `Настроено полей: ${initial.length} — ${initial.map((f) => f.label).join(", ")}.`}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted"
        >
          Настроить поля
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mb-8 flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <input type="hidden" name="fields" value={payload} />

      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Поля заказа</p>
          <p className="mt-1 text-sm text-ink-muted">
            Под вашу нишу: риелтору — адрес и бюджет, кафе — блюдо и время доставки. Бот заполняет их
            по ходу разговора и вызывает save_order, когда узнаёт что-то новое.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          Свернуть
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <li key={index} className="flex flex-col gap-2 rounded-lg border border-line bg-panel-muted p-3 sm:flex-row sm:items-start">
            <input
              value={field.label}
              onChange={(e) => patch(index, { label: e.target.value })}
              placeholder="Название поля, например «Товар»"
              className={`${INPUT} flex-1`}
            />
            <select
              value={field.type}
              onChange={(e) => patch(index, { type: e.target.value as OrderFieldType })}
              className={`${INPUT} sm:w-44`}
            >
              {ORDER_FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {field.type === "SELECT" && (
              <input
                value={field.options}
                onChange={(e) => patch(index, { options: e.target.value })}
                placeholder="Варианты через запятую"
                className={`${INPUT} sm:w-56`}
              />
            )}
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 py-2">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => patch(index, { required: e.target.checked })}
                className="size-4 accent-[var(--accent)]"
              />
              <span className="text-sm text-ink-muted">обязательное</span>
            </label>
            <button
              type="button"
              onClick={() => remove(index)}
              className="shrink-0 self-start rounded-lg px-2 py-2 text-sm text-ink-faint transition-colors hover:text-danger"
            >
              Убрать
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="self-start rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted"
      >
        + Добавить поле
      </button>

      {state && "error" in state && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{state.ok}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Сохраняем…" : "Сохранить поля"}
      </button>
    </form>
  );
}
