import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signInAction } from "@/app/(auth)/actions";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Вход — WhatsApp CRM" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verifyError?: string }>;
}) {
  if (await currentUser()) {
    redirect("/inbox");
  }
  const { verifyError } = await searchParams;

  return (
    <AuthForm
      title="Вход в кабинет"
      subtitle={
        verifyError
          ? "Ссылка подтверждения недействительна или устарела (48 часов). Войдите, если уже подтвердили почту."
          : "Переписка вашей команды с клиентами — в одном месте."
      }
      submitLabel="Войти"
      action={signInAction}
      fields={[
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
          autoComplete: "current-password",
        },
      ]}
      footer={{ text: "Ещё нет кабинета?", linkLabel: "Создать", href: "/signup" }}
    />
  );
}
