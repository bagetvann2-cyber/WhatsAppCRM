import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Диалоги</h1>

      {conversations.length === 0 && (
        <p className="text-slate-500">
          Пока пусто. Напишите на тестовый номер из WhatsApp — сообщение появится здесь.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={`/chat/${conversation.id}`}
              className="block rounded border border-slate-200 p-4 hover:bg-slate-50"
            >
              <div className="font-medium">
                {conversation.contact.name ?? conversation.contact.waId}
              </div>
              <div className="truncate text-sm text-slate-500">
                {conversation.messages[0]?.text ?? "—"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
