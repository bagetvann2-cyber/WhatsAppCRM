"use client";

import { MoonIcon, SunIcon } from "@/components/icons";

/**
 * Переключатель темы. Выбор запоминается: кабинет открывают на чужих мониторах
 * и в переговорных, и системная настройка там своя.
 *
 * Состояния в React намеренно нет. Тема живёт в атрибуте на <html>, нужную
 * иконку выбирает CSS — поэтому нечему разъезжаться между сервером и браузером
 * и нечему мигать при загрузке.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";

    root.dataset.theme = next;
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Сменить тему"
      aria-label="Сменить тему оформления"
      className="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-panel hover:text-ink"
    >
      <MoonIcon className="theme-icon-dark size-5" />
      <SunIcon className="theme-icon-light size-5" />
    </button>
  );
}
