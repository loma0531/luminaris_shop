/**
 * ฟังก์ชันคำนวณราคาโปรโมชันสินค้าแบบไดนามิก โดยตรวจสอบเงื่อนไขเวลาจริงอย่างเข้มงวด
 * (now >= saleStart && now <= saleEnd)
 */
export function getProductActivePrice(product: {
  price: number
  saleActive?: boolean
  discountType?: string | null
  discountValue?: number | null
  saleStart?: Date | string | null
  saleEnd?: Date | string | null
}): number {
  const price = Number(product.price)
  if (isNaN(price)) return 0

  // ตรวจสอบเงื่อนไขว่าเปิดแคมเปญลดราคาอยู่หรือไม่
  if (!product.saleActive) {
    return price
  }

  const now = new Date()

  // ตรวจสอบเงื่อนไขเวลาเริ่มต้น (ถ้ากำหนดไว้)
  if (product.saleStart) {
    const startDate = new Date(product.saleStart)
    if (now < startDate) {
      return price
    }
  }

  // ตรวจสอบเงื่อนไขเวลาสิ้นสุด (ถ้ากำหนดไว้)
  if (product.saleEnd) {
    const endDate = new Date(product.saleEnd)
    if (now > endDate) {
      return price
    }
  }

  // หากไม่มีมูลค่าส่วนลดหรือไม่มีประเภท ให้คืนราคาปกติ
  if (!product.discountType || product.discountValue === undefined || product.discountValue === null) {
    return price
  }

  const discountValue = Number(product.discountValue)
  if (isNaN(discountValue) || discountValue <= 0) {
    return price
  }

  // คำนวณราคาส่วนลดตามประเภท
  if (product.discountType === 'PERCENTAGE') {
    return Math.max(0, price - (price * (discountValue / 100)))
  } else if (product.discountType === 'FIXED') {
    return Math.max(0, price - discountValue)
  }

  return price
}

/**
 * ฟังก์ชันตรวจสอบว่าสินค้าลดราคาอยู่จริง ณ ปัจจุบันหรือไม่
 */
export function isProductOnSale(product: {
  saleActive?: boolean
  saleStart?: Date | string | null
  saleEnd?: Date | string | null
  discountType?: string | null
  discountValue?: number | null
}): boolean {
  if (!product.saleActive) return false
  if (!product.discountType || product.discountValue === undefined || product.discountValue === null) return false

  const now = new Date()
  if (product.saleStart) {
    const startDate = new Date(product.saleStart)
    if (now < startDate) return false
  }
  if (product.saleEnd) {
    const endDate = new Date(product.saleEnd)
    if (now > endDate) return false
  }

  const discountValue = Number(product.discountValue)
  return !isNaN(discountValue) && discountValue > 0
}
