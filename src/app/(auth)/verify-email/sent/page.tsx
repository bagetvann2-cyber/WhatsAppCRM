import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Подтвердите почту — WhatsApp CRM" };

export default async function VerifyEmailSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (await currentUser()) {
    redirect("/inbox");
  }
  const { email } = await searchParams;

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Проверьте почту</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Мы отправили письмо{email ? <> на <span className="text-ink">{email}</span></> : null} со ссылкой
          для подтверждения. Перейдите по ней, чтобы войти в кабинет.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">
          Уже подтвердили? Войти
        </Link>
      </div>
    </main>
  );
}
