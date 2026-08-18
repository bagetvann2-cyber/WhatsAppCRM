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

/**
 * Выбранная тема ставится до первой отрисовки. Иначе страница успевает
 * мигнуть системной темой — на светлом мониторе это вспышка чёрного.
 */
const APPLY_THEME = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
