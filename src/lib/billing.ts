/**
 * Арифметика тарифов. Без обращений к базе: те же формулы считает и сервер,
 * и карточка тарифа в браузере — расхождение в цене между экраном и счётом
 * клиент замечает мгновенно и перестаёт доверять всему остальному.
 */

/** Скидка за период оплаты, раздел 9 ТЗ. Ключ — число месяцев. */
export const PERIOD_DISCOUNT: Record<number, number> = {
  1: 0,
  6: 0.1,
  12: 0.2,
};

export const PERIODS = [1, 6, 12] as const;
export type Period = (typeof PERIODS)[number];

export function periodDiscount(months: number): number {
  return PERIOD_DISCOUNT[months] ?? 0;
}

export type PlanTerms = {
  monthlyPrice: number;
  operatorsIncluded: number;
  extraOperatorPrice: number;
};

/** Доплата за сотрудников сверх включённых в тариф. */
export function extraOperatorsCost(plan: PlanTerms, operators: number): number {
  const extra = Math.max(0, operators - plan.operatorsIncluded);
  return extra * plan.extraOperatorPrice;
}

export type PriceBreakdown = {
  months: number;
  perMonth: number;
  base: number;
  discountRate: number;
  discount: number;
  total: number;
};

/**
 * Стоимость подписки за период. Скидка считается от суммы подписки вместе
 * с доплатой за сотрудников: платит клиент одним счётом, и делить его на
 * «со скидкой» и «без» — способ получить спор на ровном месте.
 */
export function subscriptionPrice(
  plan: PlanTerms,
  months: number,
  operators: number,
): PriceBreakdown {
  const perMonth = plan.monthlyPrice + extraOperatorsCost(plan, operators);
  const base = perMonth * months;
  const discountRate = periodDiscount(months);
  const discount = Math.round(base * discountRate);

  return { months, perMonth, base, discountRate, discount, total: base - discount };
}

/** Сумма прописью для интерфейса: 29990 → «29 990 ₸». */
export function money(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₸`;
}

/**
 * Хватает ли баланса на рассылку. Проверяем до запуска: остановленная
 * на середине рассылка — это половина клиентов с обрывком акции.
 */
export function canAfford(balance: number, cost: number): boolean {
  return balance >= cost;
}

/** Порог, ниже которого пора предупреждать: примерно на 100 сообщений. */
export const LOW_BALANCE_THRESHOLD = 2000;

export type BalanceLevel = "ok" | "low" | "empty";

export function balanceLevel(balance: number): BalanceLevel {
  if (balance <= 0) {
    return "empty";
  }
  return balance < LOW_BALANCE_THRESHOLD ? "low" : "ok";
}

/** Сколько дней осталось до конца оплаченного периода или пробного. */
export function daysLeft(until: Date | null, now: Date = new Date()): number | null {
  if (!until) {
    return null;
  }
  const ms = until.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 3600 * 1000));
}
