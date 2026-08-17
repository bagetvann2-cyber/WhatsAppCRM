"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";

/**
 * Поиск по диалогам. Запрос живёт в адресе (?q=), поэтому результат можно
 * переслать коллеге ссылкой, а обновление страницы его не теряет.
 */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    // Пауза перед запросом: иначе база получает запрос на каждую букву.
    const timer = setTimeout(() => {
      const query = value.trim();
      router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname);
    }, 250);

    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Имя, номер или текст сообщения"
        aria-label="Поиск по диалогам"
        className="w-full rounded-lg border border-line bg-panel-muted py-2 pr-3 pl-9 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel"
      />
    </div>
  );
}
