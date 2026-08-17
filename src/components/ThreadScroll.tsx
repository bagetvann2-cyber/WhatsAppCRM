"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Прокрутка переписки. Открытый диалог всегда показывает низ ленты,
 * но если оператор ушёл читать историю вверх — новое сообщение его не дёргает.
 */
export function ThreadScroll({ marker, children }: { marker: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  useEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }

    if (wasAtBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [marker]);

  function onScroll() {
    const element = box.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    wasAtBottom.current = distanceFromBottom < 80;
  }

  return (
    <div ref={box} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}
