import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/LandingPage";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WhatsAppCRM: CRM с ИИ-ботом вместо ручной переписки",
  description:
    "Наша CRM отвечает клиентам в WhatsApp и Telegram и собирает нужные данные в таблицу, пока вы спите. Работает уже сейчас, не концепт.",
};

/** Вошедшего сразу ведём в инбокс — витрина не для него. */
export default async function HomePage() {
  if (await currentUser()) {
    redirect("/inbox");
  }

  return <LandingPage />;
}
