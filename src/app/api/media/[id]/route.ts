import { downloadName } from "@/lib/media";
import { ensureMediaFile, findMediaMessage, readMediaFile } from "@/lib/media-store";
import { currentUser } from "@/lib/session";

/**
 * Отдаёт вложение из переписки. Прямых ссылок на файлы нет и быть не может:
 * запрос проходит через проверку организации, иначе чужую медкарту или счёт
 * можно было бы открыть, зная один идентификатор.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/media/[id]">,
): Promise<Response> {
  const me = await currentUser();
  if (!me) {
    return new Response("Нужно войти в кабинет", { status: 401 });
  }

  const { id } = await context.params;

  // Чужое сообщение и несуществующее отвечают одинаково: чужие id не подтверждаем.
  const message = await findMediaMessage(me.organization.id, id);
  if (!message) {
    return new Response("Вложение не найдено", { status: 404 });
  }

  const ready = await ensureMediaFile(message.id);
  if (!ready.ok) {
    return new Response(ready.error, { status: 502 });
  }

  const file = await readMediaFile(ready.name);
  if (!file) {
    return new Response("Файл потерялся на диске", { status: 502 });
  }

  const asAttachment = new URL(request.url).searchParams.has("download");
  const name = downloadName(message);

  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": message.mimeType ?? "application/octet-stream",
      "content-length": String(file.byteLength),
      // filename* — чтобы кириллица в имени не превратилась в кракозябры.
      "content-disposition": `${asAttachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      // private: вложение переписки не должно осесть в общем кэше прокси.
      "cache-control": "private, max-age=86400",
      // Файл прислал клиент, а открывается он на нашем домене: sandbox не даёт
      // скрипту внутри SVG или HTML добраться до кабинета, nosniff — выдать
      // себя за другой тип.
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
