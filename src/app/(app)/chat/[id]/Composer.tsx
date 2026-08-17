"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Composer({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);

    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, text }),
    });

    setSending(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Не удалось отправить" }));
      setError(data.error);
      return;
    }

    setText("");
    router.refresh();
  }

  return (
    <form onSubmit={send} className="mt-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled || sending}
          placeholder={disabled ? "Окно закрыто — нужен шаблон" : "Введите сообщение"}
          className="flex-1 rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={disabled || sending || text.trim() === ""}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-40"
        >
          {sending ? "Отправка" : "Отправить"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
