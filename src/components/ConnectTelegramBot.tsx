"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon } from "@/components/icons";

type Status = { kind: "idle" } | { kind: "connecting" } | { kind: "error"; message: string };

/**
 * Подключение своего Telegram-бота — просто токен от BotFather, без попапа:
 * бэкенд сам проверяет его через getMe и регистрирует вебхук
 * (src/app/api/channels/telegram/connect/route.ts).
 */
export function ConnectTelegramBot() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function connect() {
    if (!token.trim()) {
      return;
    }
    setStatus({ kind: "connecting" });

    try {
      const res = await fetch("/api/channels/telegram/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken: token.trim() }),
      });
      const result = await res.json();

      if (!res.ok) {
        setStatus({ kind: "error", message: result.error ?? "Не удалось подключить бота" });
        return;
      }

      setToken("");
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Не удалось связаться с сервером" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Токен от @BotFather"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={connect}
          disabled={!token.trim() || status.kind === "connecting"}
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {status.kind === "connecting" ? "Подключаем…" : "Подключить Telegram-бота"}
        </button>
      </div>

      {status.kind === "error" && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {status.message}
        </p>
      )}
    </div>
  );
}
