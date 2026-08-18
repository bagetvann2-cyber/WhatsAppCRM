import { redirect } from "next/navigation";
import { AutomationForm } from "@/components/AutomationForm";
import { PageHead } from "@/components/ledger";
import { getAutomation } from "@/lib/automation-store";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Автоответы — WhatsApp CRM" };

export default async function AutomationPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const settings = await getAutomation(organization.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="Автоответы">
        Два ответа, которые робот пишет за вас: первому обращению и в нерабочее время. Оба видны
        оператору в переписке как обычные исходящие — сюрприза «клиенту кто-то ответил» не будет.
      </PageHead>

      <AutomationForm initial={settings} />
    </main>
  );
}
