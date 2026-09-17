import { ConversationList } from "@/components/ConversationList";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Shell } from "@/components/Shell";
import { InboxIcon } from "@/components/icons";
import { queueCounts } from "@/lib/assignment";
import { listConversations, parseScope } from "@/lib/conversations";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { user, organization } = await requireUser();
  const { q, scope } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const view = parseScope(scope);

  const [conversations, counts] = await Promise.all([
    listConversations(organization.id, query, { scope: view, userId: user.id }),
    queueCounts(organization.id, user.id),
  ]);

  return (
    <>
      <LiveRefresh />
      <Shell
        mobile="list"
        sidebar={
          <ConversationList
            conversations={conversations}
            query={query}
            scope={view}
            meId={user.id}
            counts={counts}
          />
        }
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
