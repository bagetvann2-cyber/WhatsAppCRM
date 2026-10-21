import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  fetchPhoneNumberInfo,
  registerPhoneNumber,
  subscribeWaba,
  type PhoneNumberInfo,
} from "@/lib/whatsapp/embedded-signup";
import type { WhatsAppCredentials } from "@/lib/whatsapp/client";

export type SignupResult =
  | { ok: true; channelId: string; info: PhoneNumberInfo }
  | { ok: false; step: string; error: string };

/**
 * Всё, что происходит после Facebook-попапа: обмен code на токен, регистрация
 * номера в Cloud API, подписка приложения на вебхуки WABA, чтение статуса.
 * Каждый шаг пишется в Channel.connectStep — если что-то упадёт, видно, на
 * каком именно шаге, а не просто «не получилось».
 */
export async function completeEmbeddedSignup(input: {
  organizationId: string;
  code: string;
  phoneNumberId: string;
  wabaId: string;
}): Promise<SignupResult> {
  const existing = await prisma.channel.findUnique({
    where: { type_externalId: { type: "WHATSAPP", externalId: input.phoneNumberId } },
  });

  // Чужой номер не трогаем вообще: иначе любая компания с мусорным code
  // переведёт рабочий канал другой компании в ERROR.
  if (existing && existing.organizationId !== input.organizationId) {
    return { ok: false, step: "exchange_token", error: "Этот номер уже подключён к другому кабинету." };
  }

  // Рабочий ACTIVE-канал при переподключении не понижаем в PENDING/ERROR,
  // пока новый токен не получен: пишем только шаг и текст ошибки.
  const keepActive = existing?.status === "ACTIVE";

  const channel = existing
    ? await prisma.channel.update({
        where: { id: existing.id },
        data: keepActive
          ? { connectStep: "exchange_token", statusError: null }
          : { status: "PENDING", connectStep: "exchange_token", statusError: null },
      })
    : await prisma.channel.create({
        data: {
          organizationId: input.organizationId,
          type: "WHATSAPP",
          connectionMethod: "WA_EMBEDDED_SIGNUP",
          name: "WhatsApp",
          externalId: input.phoneNumberId,
          status: "PENDING",
          connectStep: "exchange_token",
        },
      });

  async function step(name: string): Promise<void> {
    await prisma.channel.update({ where: { id: channel.id }, data: { connectStep: name } });
  }

  try {
    const { accessToken } = await exchangeCodeForToken(input.code);

    await step("register_number");
    const pin = crypto.randomInt(100000, 999999).toString();
    await registerPhoneNumber(input.phoneNumberId, accessToken, pin);

    await step("subscribe_webhook");
    await subscribeWaba(input.wabaId, accessToken);

    await step("fetch_status");
    const info = await fetchPhoneNumberInfo(input.phoneNumberId, accessToken);

    const credentials: WhatsAppCredentials = {
      accessToken,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      pin,
    };

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        status: "ACTIVE",
        connectStep: null,
        statusError: null,
        externalUsername: info.displayPhoneNumber || null,
        credentialsEncrypted: encryptJson(credentials),
      },
    });

    return { ok: true, channelId: channel.id, info };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось подключить номер";
    const failed = await prisma.channel.update({
      where: { id: channel.id },
      data: keepActive ? { statusError: message } : { status: "ERROR", statusError: message },
    });

    return { ok: false, step: failed.connectStep ?? "unknown", error: message };
  }
}
