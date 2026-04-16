import { refundItemsRepo } from "./repo";

export async function getRefundItem(recordId: string) {
  return refundItemsRepo.getRefundItemById(recordId);
}
