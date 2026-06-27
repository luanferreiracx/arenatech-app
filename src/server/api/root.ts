import { createTRPCRouter } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { twoFactorRouter } from "@/server/api/routers/two-factor";
import { cashierRouter } from "@/server/api/routers/cashier";
import { catalogRouter } from "@/server/api/routers/catalog";
import { communicationRouter } from "@/server/api/routers/communication";
import { customerRouter } from "@/server/api/routers/customer";
import { dashboardRouter } from "@/server/api/routers/dashboard";
import { financialRouter } from "@/server/api/routers/financial";
import { fiscalRouter } from "@/server/api/routers/fiscal";
import { imeiRouter } from "@/server/api/routers/imei";
import { interestRouter } from "@/server/api/routers/interest";
import { operationRouter } from "@/server/api/routers/operation";
import { quickSaleRouter } from "@/server/api/routers/quick-sale";
import { paymentLinkRouter } from "@/server/api/routers/payment-link";
import { saleRouter } from "@/server/api/routers/sale";
import { serviceOrderRouter } from "@/server/api/routers/service-order";
import { simulatorRouter } from "@/server/api/routers/simulator";
import { stockRouter } from "@/server/api/routers/stock";
import { settingsRouter } from "@/server/api/routers/settings";
import { valuationRouter } from "@/server/api/routers/valuation";
import { adminRouter } from "@/server/api/routers/admin";
import { depixWithdrawRouter } from "@/server/api/routers/depix-withdraw";
import { depixWalletRouter } from "@/server/api/routers/depix-wallet";
import { depixTransactionRouter } from "@/server/api/routers/depix-transaction";
import { depixLbtcAdminRouter } from "@/server/api/routers/depix-lbtc-admin";
import { depixFeeWalletAdminRouter } from "@/server/api/routers/depix-fee-wallet-admin";
import { providerCommissionRouter } from "@/server/api/routers/provider-commission";
import { reportRouter } from "@/server/api/routers/report";
import { nfeImportRouter } from "@/server/api/routers/nfe-import";
import { checklistRouter } from "@/server/api/routers/checklist";
import { rewardRouter } from "@/server/api/routers/reward";
import { chatbotRouter } from "@/server/api/routers/chatbot";
import { iphoneHunterRouter } from "@/server/api/routers/iphone-hunter";
import { noKycRouter } from "@/server/api/routers/no-kyc";
import { receivingRouter } from "@/server/api/routers/receiving";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  noKyc: noKycRouter,
  nfeImport: nfeImportRouter,
  checklist: checklistRouter,
  reward: rewardRouter,
  chatbot: chatbotRouter,
  depixWithdraw: depixWithdrawRouter,
  depixWallet: depixWalletRouter,
  depixTransaction: depixTransactionRouter,
  depixLbtcAdmin: depixLbtcAdminRouter,
  depixFeeWalletAdmin: depixFeeWalletAdminRouter,
  auth: authRouter,
  twoFactor: twoFactorRouter,
  cashier: cashierRouter,
  catalog: catalogRouter,
  communication: communicationRouter,
  customer: customerRouter,
  dashboard: dashboardRouter,
  financial: financialRouter,
  fiscal: fiscalRouter,
  imei: imeiRouter,
  interest: interestRouter,
  iphoneHunter: iphoneHunterRouter,
  operation: operationRouter,
  providerCommission: providerCommissionRouter,
  quickSale: quickSaleRouter,
  paymentLink: paymentLinkRouter,
  sale: saleRouter,
  serviceOrder: serviceOrderRouter,
  simulator: simulatorRouter,
  stock: stockRouter,
  settings: settingsRouter,
  report: reportRouter,
  receiving: receivingRouter,
  valuation: valuationRouter,
});

export type AppRouter = typeof appRouter;
