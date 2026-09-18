import { env } from "@/lib/env";

/** Письмо со ссылкой подтверждения почты. Провайдер — Resend, обычный HTTP POST. */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const base = env.publicBaseUrl();
  const link = `${base}/verify-email?token=${token}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom(),
      to,
      subject: "Подтвердите почту — WhatsApp CRM",
      html: `<p>Чтобы подтвердить почту и войти в кабинет, перейдите по ссылке (действует 48 часов):</p><p><a href="${link}">${link}</a></p>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend вернул ${res.status}: ${await res.text()}`);
  }
}
