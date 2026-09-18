import { env } from "@/lib/env";

/**
 * Шаги Embedded Signup после Facebook-попапа — все запросы к Graph API,
 * которых нет в whatsapp/client.ts (тот шлёт сообщения, это подключает номер).
 *
 * Проверено по документации Meta (developers.facebook.com/documentation/
 * business-messaging/whatsapp/embedded-signup) на 2026-09-17: точную форму
 * ответа oauth/access_token и его возможные варианты (System User токен
 * может требовать дополнительного обмена на долгоживущий) стоит сверить на
 * первом реальном подключении — страница с примером запроса была недоступна
 * без входа в аккаунт разработчика.
 */

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.graphVersion()}${path}`;
}

async function graphError(response: Response): Promise<string> {
  const body = await response.text();
  return `${response.status} ${body}`;
}

export async function exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
  const url = new URL(graphUrl("/oauth/access_token"));
  url.searchParams.set("client_id", env.appId());
  url.searchParams.set("client_secret", env.appSecret());
  url.searchParams.set("code", code);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Не удалось обменять код на токен: ${await graphError(response)}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Meta не вернула access_token");
  }
  return { accessToken: data.access_token };
}

/** Обязательный шаг после подписки — без него номер не примет и не отправит ни одного сообщения через Cloud API. */
export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin: string,
): Promise<void> {
  const response = await fetch(graphUrl(`/${phoneNumberId}/register`), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });

  if (!response.ok) {
    throw new Error(`Не удалось зарегистрировать номер: ${await graphError(response)}`);
  }
}

/** Без подписки вебхуки этой WABA не дойдут до нашего /api/webhook. */
export async function subscribeWaba(wabaId: string, accessToken: string): Promise<void> {
  const response = await fetch(graphUrl(`/${wabaId}/subscribed_apps`), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Не удалось подписать приложение на вебхуки WABA: ${await graphError(response)}`);
  }
}

export type PhoneNumberInfo = {
  displayPhoneNumber: string;
  verifiedName: string;
  /** GREEN / YELLOW / RED / UNKNOWN. */
  qualityRating: string;
  /** whatsapp_business_manager_messaging_limit — например TIER_250. messaging_limit_tier устарел. */
  messagingLimit: string;
};

export async function fetchPhoneNumberInfo(
  phoneNumberId: string,
  accessToken: string,
): Promise<PhoneNumberInfo> {
  const fields = "display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit";
  const response = await fetch(graphUrl(`/${phoneNumberId}?fields=${fields}`), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить статус номера: ${await graphError(response)}`);
  }

  const data = (await response.json()) as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
  };

  return {
    displayPhoneNumber: data.display_phone_number ?? "",
    verifiedName: data.verified_name ?? "",
    qualityRating: data.quality_rating ?? "UNKNOWN",
    messagingLimit: data.whatsapp_business_manager_messaging_limit ?? "UNKNOWN",
  };
}
