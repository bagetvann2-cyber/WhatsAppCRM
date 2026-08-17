import { ConversationList } from "@/components/ConversationList";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Shell } from "@/components/Shell";
import { InboxIcon } from "@/components/icons";
import { listConversations } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const conversations = await listConversations(query);

  return (
    <>
      <LiveRefresh />
      <Shell
        mobile="list"
        sidebar={<ConversationList conversations={conversations} query={query} />}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <InboxIcon className="size-10 text-ink-faint" />
          <div className="max-w-sm">
            <p className="font-semibold text-ink">Выберите диалог слева</p>
            <p className="mt-1 text-sm text-ink-muted">
              Здесь переписка всей команды с одного номера компании. Отвечать может любой оператор —
              история остаётся в кабинете, а не в чьём-то телефоне.
            </p>
          </div>
        </div>
      </Shell>
    </>
  );
}
