"use client";

import { useActionState, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { importAction, type FormState } from "@/app/contacts/actions";

export function ImportContacts() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(importAction, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted"
      >
        Импорт
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Импорт контактов</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-muted transition-colors hover:text-ink"
        >
          Свернуть
        </button>
      </div>

      <p className="mb-3 text-xs text-ink-faint">
        По одной строке на контакт: сначала номер, потом имя через запятую или точку с запятой.
        Восьмёрка в начале заменится на +7, дубли отсеются.
      </p>

      <textarea
        name="csv"
        rows={6}
        placeholder={"87011234567, Айгерим\n+7 747 555 66 77; Ержан"}
        className="w-full resize-y rounded-lg border border-line bg-panel-muted px-3 py-2 font-mono text-xs text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel"
      />

      {state && "error" in state && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state && "ok" in state && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{state.ok}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Импортируем…" : "Импортировать"}
      </button>
    </form>
  );
}
