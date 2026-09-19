import { env } from "@/lib/env";

/** Отправка письма через Resend: обычный HTTP POST. */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.emailFrom(), to, subject, html }),
  });

  if (!res.ok) {
    throw new Error(`Resend вернул ${res.status}: ${await res.text()}`);
  }
}

/** Письмо со ссылкой подтверждения почты. */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.publicBaseUrl()}/verify-email?token=${token}`;

  await sendEmail(
    to,
    "Подтвердите почту — WhatsApp CRM",
    `<p>Чтобы подтвердить почту и войти в кабинет, перейдите по ссылке (действует 48 часов):</p><p><a href="${link}">${link}</a></p>`,
  );
}
