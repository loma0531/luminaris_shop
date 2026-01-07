// Cart limits - shared between frontend and backend
export const CART_LIMITS = {
  MAX_QUANTITY_PER_ITEM: 99,
  MAX_TOTAL_QUANTITY: 200,
  MAX_ITEM_TYPES: 50,
} as const

// Utility function to check if adding quantity would exceed limits
export function canAddToCart(
  currentCart: { quantity: number }[],
  itemQuantity: number,
  addQuantity: number = 1
): { allowed: boolean; reason?: string } {
  const newItemQuantity = itemQuantity + addQuantity
  const currentTotal = currentCart.reduce((sum, item) => sum + item.quantity, 0)
  const newTotal = currentTotal + addQuantity

  if (newItemQuantity > CART_LIMITS.MAX_QUANTITY_PER_ITEM) {
    return {
      allowed: false,
      reason: `เกินขีดจำกัด ${CART_LIMITS.MAX_QUANTITY_PER_ITEM} ชิ้นต่อสินค้า`,
    }
  }

  if (newTotal > CART_LIMITS.MAX_TOTAL_QUANTITY) {
    return {
      allowed: false,
      reason: `เกินขีดจำกัดรวม ${CART_LIMITS.MAX_TOTAL_QUANTITY} ชิ้นต่อการสั่งซื้อ`,
    }
  }

  return { allowed: true }
}
