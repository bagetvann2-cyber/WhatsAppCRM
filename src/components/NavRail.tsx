"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import {
  BoltIcon,
  ChannelIcon,
  ChatIcon,
  LogoutIcon,
  MegaphoneIcon,
  OrderIcon,
  ReportIcon,
  SparkIcon,
  TeamIcon,
  TemplateIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { initials } from "@/lib/format";

type Item = {
  href: string;
  label: string;
  Icon: typeof ChatIcon;
  manageOnly?: boolean;
};

const ITEMS: Item[] = [
  { href: "/inbox", label: "Диалоги", Icon: ChatIcon },
  { href: "/contacts", label: "Контакты", Icon: UsersIcon },
  { href: "/orders", label: "Заказы", Icon: OrderIcon },
  { href: "/broadcasts", label: "Рассылки", Icon: MegaphoneIcon, manageOnly: true },
  { href: "/templates", label: "Шаблоны", Icon: TemplateIcon, manageOnly: true },
  { href: "/automation", label: "Автоответы", Icon: BoltIcon, manageOnly: true },
  { href: "/ai-bot", label: "ИИ-помощник", Icon: SparkIcon, manageOnly: true },
  { href: "/reports", label: "Отчёты", Icon: ReportIcon, manageOnly: true },
  { href: "/channels", label: "Каналы", Icon: ChannelIcon, manageOnly: true },
  { href: "/team", label: "Команда", Icon: TeamIcon, manageOnly: true },
  { href: "/billing", label: "Тариф", Icon: WalletIcon, manageOnly: true },
];

export function NavRail({
  organizationName,
  userLabel,
  canManage,
}: {
  organizationName: string;
  userLabel: string;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const visible = ITEMS.filter((item) => !item.manageOnly || canManage);

  function isActive(href: string): boolean {
    return href === "/inbox"
      ? pathname === "/inbox" || pathname.startsWith("/chat")
      : pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Разделы кабинета"
      className="flex shrink-0 flex-row items-center gap-1 border-line bg-panel-muted px-2 py-2 md:h-full md:w-16 md:flex-col md:border-r md:px-0 md:py-3"
    >
      <span
        title={organizationName}
        className="mb-0 hidden size-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-ink md:mb-3 md:grid"
      >
        {initials(organizationName, organizationName)}
      </span>

      {visible.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors md:flex-none md:w-12 ${
              active ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-panel hover:text-ink"
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-accent md:inset-x-auto md:inset-y-1.5 md:left-0 md:h-auto md:w-0.5"
              />
            )}
            <Icon className="size-5" />
            <span className="text-[0.625rem] leading-tight">{label}</span>
          </Link>
        );
      })}

      <div className="ml-auto flex items-center gap-1 md:mt-auto md:ml-0 md:flex-col">
        <span
          title={userLabel}
          className="grid size-9 place-items-center rounded-full bg-panel text-xs font-semibold text-ink-muted"
        >
          {initials(userLabel, userLabel)}
        </span>
        <ThemeToggle />

        <form action={signOutAction}>
          <button
            type="submit"
            title="Выйти"
            aria-label="Выйти"
            className="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-panel hover:text-danger"
          >
            <LogoutIcon className="size-5" />
          </button>
        </form>
      </div>
    </nav>
  );
}
