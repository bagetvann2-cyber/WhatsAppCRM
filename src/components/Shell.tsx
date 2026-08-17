import type { ReactNode } from "react";

/**
 * Каркас рабочего места: слева постоянный список диалогов, справа переписка.
 * На узком экране колонки не ужимаются, а сменяют друг друга — какая именно
 * видна, решает страница через mobile.
 */
export function Shell({
  sidebar,
  children,
  mobile,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  mobile: "list" | "thread";
}) {
  return (
    <div className="flex h-full overflow-hidden">
      <aside
        className={`${
          mobile === "list" ? "flex" : "hidden"
        } w-full shrink-0 flex-col border-line bg-panel md:flex md:w-[21rem] md:border-r lg:w-[23rem]`}
      >
        {sidebar}
      </aside>

      <section
        className={`${
          mobile === "thread" ? "flex" : "hidden"
        } min-w-0 flex-1 flex-col bg-page md:flex`}
      >
        {children}
      </section>
    </div>
  );
}
