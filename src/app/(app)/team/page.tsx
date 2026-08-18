import { redirect } from "next/navigation";
import { InviteForm } from "@/components/InviteForm";
import { InviteLink } from "@/components/InviteLink";
import { Group, GroupTitle, PageHead } from "@/components/ledger";
import { initials } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canManageTeam, listInvites, listMembers } from "@/lib/team";
import { revokeInviteAction } from "@/app/(app)/team/actions";

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
      <PageHead title="Команда">
        {organization.name} · {members.length}{" "}
        {members.length === 1 ? "участник" : members.length < 5 ? "участника" : "участников"}
      </PageHead>

      <Group className="mt-0">
        <GroupTitle>Участники</GroupTitle>

        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-panel-muted text-xs font-semibold text-ink-muted"
            >
              {initials(member.user.name, member.user.email)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">
                {member.user.name ?? member.user.email}
                {member.userId === user.id && (
                  <span className="ml-2 text-xs text-ink-faint">это вы</span>
                )}
              </span>
              <span className="block truncate text-xs text-ink-faint">{member.user.email}</span>
            </span>

            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold text-ink">
                {ROLE_LABEL[member.role]}
              </span>
              <span className="block text-xs text-ink-faint">{ROLE_RIGHTS[member.role]}</span>
            </span>
          </div>
        ))}
      </Group>

      <Group>
        <GroupTitle>Пригласить сотрудника</GroupTitle>
        <p className="pt-3 text-sm text-ink-muted">
          Ссылка одноразовая и действует 7 дней. Письма мы не отправляем — передайте ссылку сами,
          хоть в том же WhatsApp.
        </p>
        <div className="pt-4">
          <InviteForm />
        </div>
      </Group>

      {invites.length > 0 && (
        <Group>
          <GroupTitle>Ссылки, которыми ещё не воспользовались</GroupTitle>

          {invites.map((invite) => (
            <div key={invite.id} className="border-b border-line py-3.5 last:border-b-0">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-ink">
                  {invite.hint ?? "Без подсказки"}{" "}
                  <span className="text-ink-faint">
                    · {ROLE_LABEL[invite.role].toLowerCase()}
                  </span>
                </span>
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
            </div>
          ))}
        </Group>
      )}
    </main>
  );
}
