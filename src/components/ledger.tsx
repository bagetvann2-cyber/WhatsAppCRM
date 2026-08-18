import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Почерк кабинета — «ведомость»: подпись слева, значение справа, между ними
 * отбивка. Карточек нет намеренно, глаз идёт по колонке значений сверху вниз.
 * Все разделы собираются из этих примитивов, чтобы плотность и ритм совпадали.
 */

/** Шапка раздела: заголовок и одна строка о том, зачем сюда заходят. */
export function PageHead({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {children && <p className="mt-1 max-w-xl text-sm text-ink-muted">{children}</p>}
      </div>
      {action}
    </header>
  );
}

/** Отчёркнутый заголовок группы. Жирная линия — единственное украшение почерка. */
export function GroupTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
      <h2 className="text-[0.8125rem] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function Group({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mt-8 ${className}`}>{children}</section>;
}

/**
 * Строка ведомости. `tone` красит значение: тревога достаётся только тому,
 * на что владелец должен среагировать сегодня.
 */
export function Row({
  label,
  value,
  note,
  tone = "plain",
  href,
  children,
}: {
  label: ReactNode;
  value?: ReactNode;
  note?: ReactNode;
  tone?: "plain" | "warn" | "accent";
  href?: string;
  children?: ReactNode;
}) {
  const valueTone =
    tone === "warn" ? "text-warn" : tone === "accent" ? "text-accent" : "text-ink";

  const content = (
    <>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {note && <span className="mt-0.5 block text-xs text-ink-faint">{note}</span>}
      </span>

      {value !== undefined && (
        <span className={`shrink-0 text-lg leading-none font-semibold tabular-nums ${valueTone}`}>
          {value}
        </span>
      )}

      {children}
    </>
  );

  const shape =
    "flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0";

  return href ? (
    <Link href={href} className={`${shape} transition-colors hover:border-line-strong`}>
      {content}
    </Link>
  ) : (
    <div className={shape}>{content}</div>
  );
}

/** Таблица в том же почерке: без рамки, на линиях. */
export function Table({ caption, head, children }: { caption: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-faint">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/** Заголовок колонки. Числовые колонки прижаты вправо — там же, где значения. */
export function Th({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return (
    <th scope="col" className={`py-2 font-medium ${numeric ? "px-4 text-right" : "pr-4"}`}>
      {children}
    </th>
  );
}

export function Td({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return (
    <td
      className={`py-2.5 ${
        numeric ? "px-4 text-right tabular-nums text-ink-muted" : "pr-4 text-ink"
      }`}
    >
      {children}
    </td>
  );
}

/** Пустое состояние: объясняет, чего нет, и что с этим делать. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-b border-line py-6 text-sm text-ink-muted">{children}</p>;
}

/** Сноска под группой — то, что объясняет данные, но само данными не является. */
export function Footnote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
      {icon}
      <span>{children}</span>
    </p>
  );
}
