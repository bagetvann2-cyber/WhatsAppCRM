"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertIcon, LockIcon, SendIcon } from "@/components/icons";

export function Composer({
  conversationId,
  windowOpen,
}: {
  conversationId: string;
  windowOpen: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const empty = text.trim() === "";

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (empty || sending || !windowOpen) {
      return;
    }

    setError(null);
    setSending(true);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Сообщение не ушло. Проверьте связь и попробуйте снова.");
        return;
      }

      setText("");
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Сообщение не отправлено.");
    } finally {
      setSending(false);
    }
  }

  // Enter отправляет, Shift+Enter переносит строку — привычка из любого мессенджера.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (!windowOpen) {
    return (
      <div className="border-t border-line bg-panel px-4 py-4 md:px-6">
        <div className="flex items-start gap-3 rounded-lg border border-line bg-panel-muted px-4 py-3">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Прошло больше 24 часов с сообщения клиента.</span>{" "}
            Правила Meta разрешают писать первым только одобренным шаблоном. Свободный ответ снова
            откроется, как только клиент напишет сам.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="border-t border-line bg-panel px-4 py-4 md:px-6">
      {error && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          rows={1}
          placeholder="Введите сообщение"
          aria-label="Текст сообщения"
          className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line bg-panel-muted px-4 py-2.5 text-[0.9375rem] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={empty || sending}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendIcon className={`size-4 ${sending ? "animate-pulse" : ""}`} />
          {sending ? "Отправляем" : "Отправить"}
        </button>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Enter — отправить, Shift + Enter — новая строка
      </p>
    </form>
  );
}
