"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/icons";
import { createInviteAction, type FormState } from "@/app/team/actions";

export function InviteForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createInviteAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Для кого ссылка</span>
        <input
          name="hint"
          placeholder="Ержан, администратор смены"
          className="rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel"
        />
        <span className="text-xs text-ink-faint">Подсказка только для вас, сотрудник её не увидит.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Роль</span>
        <select
          name="role"
          defaultValue="OPERATOR"
          className="rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong focus:border-accent focus:bg-panel"
        >
          <option value="OPERATOR">Оператор</option>
          <option value="ADMIN">Администратор</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Создаём…" : "Создать ссылку"}
      </button>

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger sm:basis-full">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
    </form>
  );
}
