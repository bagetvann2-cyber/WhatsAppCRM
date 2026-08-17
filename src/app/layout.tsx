import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Инбокс — WhatsApp CRM",
  description: "Общий инбокс WhatsApp: вся команда отвечает клиентам с одного номера компании.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
