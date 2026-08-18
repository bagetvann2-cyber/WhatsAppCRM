import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Сборка складывается в `.next/standalone` — самодостаточный сервер вместе
   * с нужным куском node_modules. Собираем на рабочей машине и заливаем
   * готовое: на сервере 2 ГБ памяти на четыре приложения, и `next build`
   * там рискует уронить соседей.
   */
  output: "standalone",
};

export default nextConfig;
