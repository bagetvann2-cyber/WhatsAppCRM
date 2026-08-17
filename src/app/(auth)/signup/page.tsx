import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signUpAction } from "@/app/(auth)/actions";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Создать кабинет — WhatsApp CRM" };

export default async function SignupPage() {
  if (await currentUser()) {
    redirect("/");
  }

  return (
    <AuthForm
      title="Создать кабинет"
      subtitle="Займёт минуту. Номер WhatsApp подключим следующим шагом."
      submitLabel="Создать кабинет"
      action={signUpAction}
      fields={[
        {
          name: "organizationName",
          label: "Название компании",
          placeholder: "Стоматология «Улыбка»",
          hint: "Так вас увидят сотрудники в кабинете.",
        },
        {
          name: "name",
          label: "Как вас зовут",
          placeholder: "Айгерим",
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
      footer={{ text: "Кабинет уже есть?", linkLabel: "Войти", href: "/login" }}
    />
  );
}
