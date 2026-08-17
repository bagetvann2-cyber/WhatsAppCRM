"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertIcon } from "@/components/icons";
import type { FormState } from "@/app/(auth)/actions";

type Field = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
};

export function AuthForm({
  title,
  subtitle,
  fields,
  submitLabel,
  action,
  footer,
  hidden,
}: {
  title: string;
  subtitle: string;
  fields: Field[];
  submitLabel: string;
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  footer: { text: string; linkLabel: string; href: string };
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          {hidden &&
            Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

          {fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{field.label}</span>
              <input
                name={field.name}
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                required={field.required ?? true}
                className="rounded-lg border border-line bg-panel px-3 py-2.5 text-[0.9375rem] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent"
              />
              {field.hint && <span className="text-xs text-ink-faint">{field.hint}</span>}
            </label>
          ))}

          {state?.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Подождите…" : submitLabel}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {footer.text}{" "}
          <Link href={footer.href} className="font-semibold text-accent hover:underline">
            {footer.linkLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
