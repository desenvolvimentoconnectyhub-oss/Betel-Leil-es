import type { MarketPaymentSimulation } from '../admin/market-analysis';
export function reviewPaymentSimulation(payment: MarketPaymentSimulation, initialBid: number): MarketPaymentSimulation {
  const downPaymentAmount =
    payment.downPaymentAmount ||
    (initialBid && payment.downPaymentPct ? Math.round(initialBid * (payment.downPaymentPct / 100)) : 0);
  const installmentBalance =
    payment.installmentBalance ||
    (initialBid && payment.downPaymentPct ? Math.round(initialBid * (1 - payment.downPaymentPct / 100)) : 0);
  const paymentSimulation: MarketPaymentSimulation = {
    ...payment,
    downPaymentAmount,
    installmentBalance,
    installmentAmount:
      payment.installmentAmount ||
      (installmentBalance && payment.installmentCount
        ? Math.round(installmentBalance / payment.installmentCount)
        : 0),
  };

return paymentSimulation;
}
