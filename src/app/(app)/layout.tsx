import type { ReactNode } from "react";
import Link from "next/link";
import { NavRail } from "@/components/NavRail";
import { getAssistantBanner } from "@/lib/ai-bot-store";
import { canManageTeam } from "@/lib/team";
import { requireUser } from "@/lib/session";

/**
 * Каркас кабинета: полоса разделов остаётся на месте при переходах,
 * а содержимое раздела меняется справа. На телефоне полоса уезжает вниз.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { organization, user, role } = await requireUser();
  // Оператору полосу не показываем: чинить ему нечем.
  const banner = canManageTeam(role) ? await getAssistantBanner(organization.id) : null;

  return (
    <div className="flex h-dvh flex-col-reverse md:flex-row">
      <NavRail
        organizationName={organization.name}
        userLabel={user.name ?? user.email}
        canManage={canManageTeam(role)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {banner && (
          <div
            role="status"
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm ${
              banner.tone === "error" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
            }`}
          >
            <span>{banner.text}</span>
            {banner.action && (
              <Link href={banner.action.href} className="font-medium underline">
                {banner.action.label}
              </Link>
            )}
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
