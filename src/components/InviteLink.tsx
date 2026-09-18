"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Ссылка-приглашение с копированием. Адрес собирается на клиенте:
 * сервер не знает, по какому имени к нему пришли — localhost, туннель или домен.
 */
export function InviteLink({ token }: { token: string }) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = origin ? `${origin}/invite/${token}` : "";
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-panel-muted px-3 py-2 text-xs text-ink-muted">
        {url || "…"}
      </code>
      <button
        type="button"
        onClick={copy}
        disabled={!url}
        className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted disabled:opacity-50"
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
