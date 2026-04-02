import {
  invoicesRepo as ordersInvoicesRepo,
  ordersRepo,
  providerBillingRepo,
  providerContextRepo,
} from "@/modules/orders";
import {
  publishInvoice,
  updateInvoiceSettings,
} from "@/lib/providers/square/invoices";

export const invoicesRepo = {
  getOrderRecord: ordersRepo.getOrderRecord,
  getInvoiceRecord: ordersInvoicesRepo.getInvoiceRecord,
  getInvoiceExternalById: ordersInvoicesRepo.getInvoiceExternalById,
  getOrgIntegrationRecord: providerContextRepo.getOrgIntegrationRecord,
  findInvoiceExternalByInvoiceAndOrgIntegration:
    ordersInvoicesRepo.findInvoiceExternalByInvoiceAndOrgIntegration,
  listInvoicesByOrder: ordersInvoicesRepo.listInvoicesByOrder,
  listOrderExternalsByInvoice: ordersRepo.listOrderExternalsByInvoice,
  createInvoiceExternal: ordersInvoicesRepo.createInvoiceExternal,
  updateInvoicePaymentLink: ordersInvoicesRepo.updateInvoicePaymentLink,
  updateInvoiceExternal: ordersInvoicesRepo.updateInvoiceExternal,
  cancelInvoice: providerBillingRepo.cancelInvoice,
  getInvoiceDetails: providerBillingRepo.getInvoiceDetails,
  getInvoicePublicUrl: providerBillingRepo.getInvoicePublicUrl,
  publishInvoice,
  updateInvoiceSettings,
};
