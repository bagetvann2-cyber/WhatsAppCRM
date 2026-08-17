import type { TemplateCategory } from "@/generated/prisma/client";

/**
 * Ориентировочная цена доставленного сообщения в тенге, по категориям Meta.
 * Значения временные: настоящие берутся из прайса Meta для Казахстана плюс
 * наценка заказчика и переезжают в настройки тарифов (раздел 9 ТЗ).
 *
 * Модуль намеренно без зависимостей: его импортирует и сервер, и браузер.
 */
export const PRICE_PER_MESSAGE: Record<TemplateCategory, number> = {
  MARKETING: 22,
  UTILITY: 9,
  AUTHENTICATION: 12,
};

export function estimateCost(count: number, category: TemplateCategory): number {
  return count * PRICE_PER_MESSAGE[category];
}
