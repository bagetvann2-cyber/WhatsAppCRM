import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteForm } from "@/components/InviteForm";
import { InviteLink } from "@/components/InviteLink";
import { BackIcon } from "@/components/icons";
import { initials } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canManageTeam, listInvites, listMembers } from "@/lib/team";
import { revokeInviteAction } from "@/app/team/actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Команда — WhatsApp CRM" };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  OPERATOR: "Оператор",
};

const ROLE_RIGHTS: Record<string, string> = {
  OWNER: "Полный доступ, включая тариф и оплату",
  ADMIN: "Чаты, команда, настройки",
  OPERATOR: "Только чаты с клиентами",
};

export default async function TeamPage() {
  const { organization, user, role } = await requireUser();

  // Оператору здесь нечего делать: команда — управляющий раздел.
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const [members, invites] = await Promise.all([
    listMembers(organization.id),
    listInvites(organization.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <BackIcon className="size-4" />К диалогам
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Команда</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {organization.name} · {members.length}{" "}
        {members.length === 1 ? "участник" : members.length < 5 ? "участника" : "участников"}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Участники</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-muted text-sm font-semibold text-ink-muted"
              >
                {initials(member.user.name, member.user.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {member.user.name ?? member.user.email}
                  {member.userId === user.id && (
                    <span className="ml-2 text-xs font-normal text-ink-faint">это вы</span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-faint">{member.user.email}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium text-ink">{ROLE_LABEL[member.role]}</p>
                <p className="text-xs text-ink-faint">{ROLE_RIGHTS[member.role]}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold text-ink">Пригласить сотрудника</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Ссылка одноразовая и действует 7 дней. Письма мы не отправляем — передайте ссылку сами,
          хоть в том же WhatsApp.
        </p>
        <div className="rounded-xl border border-line bg-panel p-4">
          <InviteForm />
        </div>
      </section>

      {invites.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">Ссылки, которыми ещё не воспользовались</h2>
          <ul className="flex flex-col gap-3">
            {invites.map((invite) => (
              <li key={invite.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm text-ink">
                    {invite.hint ?? "Без подсказки"}{" "}
                    <span className="text-ink-faint">· {ROLE_LABEL[invite.role].toLowerCase()}</span>
                  </p>
                  <form action={revokeInviteAction} className="shrink-0">
                    <input type="hidden" name="id" value={invite.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-muted transition-colors hover:text-danger"
                    >
                      Отозвать
                    </button>
                  </form>
                </div>
                <InviteLink token={invite.token} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
