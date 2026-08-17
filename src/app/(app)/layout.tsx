import type { ReactNode } from "react";
import { NavRail } from "@/components/NavRail";
import { canManageTeam } from "@/lib/team";
import { requireUser } from "@/lib/session";

/**
 * Каркас кабинета: полоса разделов остаётся на месте при переходах,
 * а содержимое раздела меняется справа. На телефоне полоса уезжает вниз.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { organization, user, role } = await requireUser();

  return (
    <div className="flex h-full flex-col-reverse md:flex-row">
      <NavRail
        organizationName={organization.name}
        userLabel={user.name ?? user.email}
        canManage={canManageTeam(role)}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
