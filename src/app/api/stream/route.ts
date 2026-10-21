import { messageEvents, type MessageUpdateEvent } from "@/lib/events";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const me = await currentUser();
  if (!me) {
    return new Response("Unauthorized", { status: 401 });
  }
  const organizationId = me.organization.id;

  const encoder = new TextEncoder();

  let onUpdate: (event: MessageUpdateEvent) => void;
  let keepAlive: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      onUpdate = (event) => {
        // Чужие события не пропускаем; null — широковещательное (статусы доставки).
        if (event.organizationId !== null && event.organizationId !== organizationId) {
          return;
        }
        controller.enqueue(encoder.encode("data: update\n\n"));
      };

      messageEvents.on("update", onUpdate);
      controller.enqueue(encoder.encode(": connected\n\n"));

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25000);
    },
    // ReadableStream не умеет чистить ресурсы из start — только отсюда.
    cancel() {
      clearInterval(keepAlive);
      messageEvents.off("update", onUpdate);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
