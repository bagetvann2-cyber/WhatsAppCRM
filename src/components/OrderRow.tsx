"use client";

import { useActionState, useState } from "react";
import { Td } from "@/components/ledger";
import { saveOrderAction, type FormState } from "@/app/(app)/orders/actions";
import { ORDER_STATUS_LABEL, type OrderFieldDef } from "@/lib/orders";

export type OrderRowData = {
  id: string;
  status: string;
  contactName: string;
  createdAt: Date;
  fields: Record<string, unknown>;
};

export function OrderRow({ order, fieldDefs }: { order: OrderRowData; fieldDefs: OrderFieldDef[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveOrderAction, null);
  const [editing, setEditing] = useState(false);
  const draft = order.status === "DRAFT";

  // Подтверждение/отмена меняют статус — форма редактирования сама уходит
  // на следующем рендере, потому что draft становится false. Без useEffect:
  // строка просто перестаёт удовлетворять условию показа формы.
  if (!editing || !draft) {
    return (
      <tr className="border-b border-line last:border-b-0">
        <Td>{order.contactName}</Td>
        <Td>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Td>
        <Td>{order.createdAt.toLocaleString("ru-RU")}</Td>
        {fieldDefs.map((field) => (
          <Td key={field.id}>{order.fields[field.id] != null ? String(order.fields[field.id]) : "—"}</Td>
        ))}
        <Td>
          {draft && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Изменить
            </button>
          )}
        </Td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-line last:border-b-0 bg-panel-muted">
      <td colSpan={fieldDefs.length + 4} className="py-3">
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-3">
          <input type="hidden" name="orderId" value={order.id} />
          <p className="text-sm font-semibold text-ink">{order.contactName}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {fieldDefs.map((field) => (
              <label key={field.id} className="flex flex-col gap-1">
                <span className="text-xs text-ink-faint">
                  {field.label}
                  {field.required && " *"}
                </span>
                <input
                  name={`field_${field.id}`}
                  defaultValue={order.fields[field.id] != null ? String(order.fields[field.id]) : ""}
                  className="rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong focus:border-accent focus:bg-panel"
                />
              </label>
            ))}
          </div>

          {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="intent"
              value="save"
              disabled={pending}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted disabled:opacity-50"
            >
              Сохранить
            </button>
            <button
              type="submit"
              name="intent"
              value="confirm"
              disabled={pending}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Подтвердить
            </button>
            <button
              type="submit"
              name="intent"
              value="cancel"
              disabled={pending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
            >
              Отменить заказ
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ml-auto rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              Закрыть
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
