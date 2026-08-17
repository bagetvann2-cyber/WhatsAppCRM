import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Composer from "./Composer";
import LiveRefresh from "./LiveRefresh";

export const dynamic = "force-dynamic";

export default async function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
  });

  if (!conversation) {
    notFound();
  }

  const windowOpen =
    conversation.windowExpiresAt !== null && conversation.windowExpiresAt.getTime() > Date.now();

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-6">
      <LiveRefresh />

      <header className="mb-4 flex items-baseline justify-between border-b border-slate-200 pb-3">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:underline">
            ← Все диалоги
          </Link>
          <h1 className="text-xl font-semibold">
            {conversation.contact.name ?? conversation.contact.waId}
          </h1>
        </div>
        <span className={windowOpen ? "text-sm text-emerald-700" : "text-sm text-amber-700"}>
          {windowOpen
            ? `Окно открыто до ${conversation.windowExpiresAt!.toLocaleString("ru-RU")}`
            : "Окно 24 часа закрыто"}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={
              message.direction === "OUTBOUND"
                ? "self-end rounded-lg bg-emerald-600 px-3 py-2 text-white"
                : "self-start rounded-lg bg-slate-100 px-3 py-2"
            }
          >
            <div>{message.text ?? `[${message.type}]`}</div>
            <div className="mt-1 text-xs opacity-70">
              {message.timestamp.toLocaleTimeString("ru-RU")}
              {message.status ? ` · ${message.status}` : ""}
            </div>
          </div>
        ))}
      </div>

      <Composer conversationId={conversation.id} disabled={!windowOpen} />
    </main>
  );
}
