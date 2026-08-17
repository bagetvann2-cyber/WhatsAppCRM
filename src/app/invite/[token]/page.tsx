import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { acceptInviteAction } from "@/app/(app)/team/actions";
import { checkInvite } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Приглашение — WhatsApp CRM" };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "владельца",
  ADMIN: "администратора",
  OPERATOR: "оператора",
};

const REASON_TEXT = {
  "not-found": "Такой ссылки не существует.",
  expired: "Срок действия ссылки истёк — она живёт 7 дней.",
  used: "По этой ссылке уже зарегистрировались.",
} as const;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const check = await checkInvite(token);

  if (!check.ok) {
    return (
      <main className="flex min-h-full items-center justify-center px-4 py-12">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-ink">Ссылка не работает</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {REASON_TEXT[check.reason]} Попросите новую у того, кто вас пригласил.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-semibold text-accent hover:underline"
          >
            Войти в существующий кабинет
          </Link>
        </div>
      </main>
    );
  }

  return (
    <AuthForm
      title={`Вас пригласили в «${check.invite.organizationName}»`}
      subtitle={`Вы получите доступ в роли ${ROLE_LABEL[check.invite.role]}. Придумайте пароль — им будете входить в кабинет.`}
      submitLabel="Принять приглашение"
      action={acceptInviteAction}
      hidden={{ token }}
      fields={[
        {
          name: "name",
          label: "Как вас зовут",
          placeholder: "Ержан",
          autoComplete: "name",
          required: false,
        },
        {
          name: "email",
          label: "Рабочая почта",
          type: "email",
          placeholder: "you@company.kz",
          autoComplete: "email",
        },
        {
          name: "password",
          label: "Пароль",
          type: "password",
          autoComplete: "new-password",
          hint: "Не короче 8 символов.",
        },
      ]}
      footer={{ text: "Уже работаете здесь?", linkLabel: "Войти", href: "/login" }}
    />
  );
}
