"use client";

import { useEffect, useState } from "react";
import { ClockIcon, LockIcon } from "@/components/icons";
import { remainingLabel } from "@/lib/format";

const HOUR = 3600_000;

/**
 * Обратный отсчёт окна 24 часов. Правило Meta: после сообщения клиента есть
 * сутки на свободный ответ, дальше — только одобренный шаблон. Оператор должен
 * видеть остаток до того, как упрётся в блокировку.
 */
export function WindowTimer({ expiresAt }: { expiresAt: string | null }) {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  const left = deadline === null ? 0 : deadline - now;

  useEffect(() => {
    if (deadline === null) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null || left <= 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-panel-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
        <LockIcon className="size-3.5 shrink-0" />
        Окно закрыто<span className="hidden sm:inline">&nbsp;— нужен шаблон</span>
      </span>
    );
  }

  const urgent = left < HOUR;

  return (
    <span
      suppressHydrationWarning
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        urgent ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"
      }`}
    >
      <ClockIcon className="size-3.5 shrink-0" />
      {/* На узком экране остаётся только цифра — иначе подпись съедает имя клиента */}
      <span className="hidden sm:inline">
        {urgent ? "Окно закроется через" : "Окно открыто ещё"}&nbsp;
      </span>
      {remainingLabel(left)}
    </span>
  );
}
