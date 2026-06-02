'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoginModal from '@/components/LoginModal'
import ConfirmModal from '@/components/ConfirmModal'
import { SkeletonCartItem } from '@/components/Skeleton'
import {
  CartIcon,
  PackageIcon,
  TrashIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
} from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { useToast } from '@/context/ToastContext'
import { useShop } from '../layout'
import { CART_LIMITS, canAddToCart } from '@/lib/cartLimits'
import { logger } from '@/lib/logger'
import { useCart, getCartKey as getSWRCartKey } from '@/lib/swr-hooks'
import { mutate as globalMutate } from 'swr'
import { cartSaveStarted, cartSaveCompleted, hasCartSavesInFlight } from '@/lib/cartSaveTracker'
import { getProductActivePrice, isProductOnSale } from '@/lib/productPricing'


interface User {
  id: string
  minecraftName: string
}

interface Product {
  id: string
  name: string
  price: number
  image: string | null
  commands: string[]
  description?: string | null
  category?: {
    id: string
    name: string
  }
  saleActive?: boolean
  discountType?: string | null
  discountValue?: number | null
  saleStart?: string | null
  saleEnd?: string | null
}

interface CartItem {
  product: Product
  quantity: number
  customInput?: string | null
}

export default function CartPage() {
  const [user, setUser] = useState<User | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasPendingOrder, setHasPendingOrder] = useState(false)
  const [modifyingItems, setModifyingItems] = useState<Set<string>>(new Set())
  const [showConfirmOnlineModal, setShowConfirmOnlineModal] = useState(false)
  const [recommendedList, setRecommendedList] = useState<Product[]>([])

  const router = useRouter()
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast()
  const { 
    setCartCount, 
    updatePendingCount, 
    startCartSave, 
    endCartSave, 
    isCartSaving,
    products,
    isLoadingData,
    triggerCartAnimation
  } = useShop()
  
  // Debounce timer for cart sync to prevent race conditions
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Ref to store pending cart for flush on unmount
  const pendingCartRef = useRef<{ items: CartItem[], minecraftName: string } | null>(null)
  // Ref to prevent SWR overwrite during initial load if needed
  const isMountedRef = useRef(false)

  // Clear modifying items when global save finishes
  useEffect(() => {
    if (!isCartSaving) {
      setModifyingItems(new Set())
    }
  }, [isCartSaving])

  // Load user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const userObj = JSON.parse(storedUser)
        setUser(userObj)
      } catch {
        localStorage.removeItem('user')
        localStorage.removeItem('shopToken')
      }
    }
    
    // Check for pending order
    const checkPendingOrder = async () => {
      if (!storedUser) return
      try {
        const userObj = JSON.parse(storedUser)
        const res = await apiFetch('/api/orders/latest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minecraftName: userObj.minecraftName }),
        })
        const data = await res.json()
        if (data.found) {
          setHasPendingOrder(true)
        }
      } catch (e) {
        logger.error(`Error checking pending order: ${e}`)
      }
    }
    checkPendingOrder()
  }, [])

  // สุ่มสินค้าแนะนำ (ของจัดโปรขึ้นก่อน ตามด้วย ราคาแพง 2 ชิ้น และราคาถูก 2 ชิ้น)
  useEffect(() => {
    if (isLoadingData || !products || products.length === 0) return

    const eligible = products.filter(
      (p) => p.isActive !== false && p.requiresInput !== true && p.requireInput !== true
    )

    if (eligible.length === 0) {
      setRecommendedList([])
      return
    }

    // กรองกลุ่มโปรโมชัน (On Sale)
    const salePool = eligible.filter((p) => isProductOnSale(p))
    // กรองกลุ่มราคาปกติ (Normal)
    const normalPool = eligible.filter((p) => !isProductOnSale(p))

    // เรียงลำดับราคาปกติเพื่อแบ่งเป็นถูก-แพง
    const sortedNormal = [...normalPool].sort((a, b) => a.price - b.price)
    
    // แบ่งครึ่งเพื่อแยกกลุ่มราคาถูกกับราคาแพง
    const midIndex = Math.floor(sortedNormal.length / 2)
    const cheapPool = sortedNormal.slice(0, midIndex)
    const expensivePool = sortedNormal.slice(midIndex)

    // ฟังก์ชันสุ่ม
    const getRandomItems = (arr: Product[], count: number): Product[] => {
      const shuffled = [...arr].sort(() => 0.5 - Math.random())
      return shuffled.slice(0, count)
    }

    let selected: Product[] = []

    // 1. ดึงของลดราคาก่อน (สูงสุด 4 ชิ้น)
    const selectedSale = getRandomItems(salePool, 4)
    selected = [...selectedSale]

    // 2. ถ้ายังไม่ครบ 4 ชิ้น ค่อยดึงราคาแพงกับราคาถูกมาเสริม
    const remainingSlots = 4 - selected.length
    if (remainingSlots > 0) {
      // ต้องการสุ่มจากกลุ่มแพง และ ถูก อย่างละเท่าๆ กันตามสัดส่วน
      const expensiveCount = Math.ceil(remainingSlots / 2)
      const cheapCount = remainingSlots - expensiveCount

      const selectedExpensive = getRandomItems(expensivePool, expensiveCount)
      const selectedCheap = getRandomItems(cheapPool, cheapCount)

      selected = [...selected, ...selectedExpensive, ...selectedCheap]
    }

    // จัดเรียงผลลัพธ์สุดท้ายให้ ของลดราคา ขึ้นก่อนเสมอ
    const finalSorted = [...selected].sort((a, b) => {
      const aSale = isProductOnSale(a) ? 1 : 0
      const bSale = isProductOnSale(b) ? 1 : 0
      return bSale - aSale
    })

    setRecommendedList(finalSorted.slice(0, 4))
  }, [products, isLoadingData])

  // SWR: ดึงข้อมูล cart อัตโนมัติ
  const { data: cartData, isLoading: cartLoading } = useCart(user?.minecraftName || null)
  const initialLoading = !user ? false : cartLoading

  // Sync SWR data → local state
  useEffect(() => {
    if (cartData) {
      if (!isMountedRef.current) {
        // First mount/load: Always take SWR data (optimistic from Shop)
        setCart(cartData.items || [])
        isMountedRef.current = true
      } else if (!hasCartSavesInFlight()) {
        // Subsequent updates: Only sync if no local saves are pending
        setCart(cartData.items || [])
      }
    }
  }, [cartData])

  // ──── Optimistic SWR Cache Update ────
  // อัปเดต SWR cache ทันที (ก่อน API call)
  const optimisticUpdateCache = useCallback((newItems: CartItem[]) => {
    if (!user) return
    const newCount = newItems.reduce((sum, item) => sum + item.quantity, 0)
    const cartKey = getSWRCartKey(user.minecraftName)
    globalMutate(cartKey, { items: newItems, count: newCount }, { revalidate: false })
  }, [user])

  // Debounced cart sync - batches rapid clicks into single API call
  const debouncedSaveCart = useCallback((items: CartItem[], minecraftName: string) => {
    // ⚡ Optimistic cache update ทันที
    optimisticUpdateCache(items)
    
    // Track save in shared tracker AND global context
    cartSaveStarted()
    startCartSave()
    
    // Store pending cart
    pendingCartRef.current = { items, minecraftName }
    
    // Clear any pending sync
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      // ลด counter เพราะ save ก่อนหน้าถูก cancel
      cartSaveCompleted()
    }
    
    // Schedule new sync after 800ms of inactivity
    syncTimerRef.current = setTimeout(async () => {
      if (!pendingCartRef.current) return
      
      const { items: cartItems, minecraftName: mcName } = pendingCartRef.current
      pendingCartRef.current = null
      syncTimerRef.current = null
      
      try {
        await apiFetch('/api/cart?quick=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            minecraftName: mcName, 
            items: cartItems.map(i => ({ productId: i.product.id, quantity: i.quantity, customInput: i.customInput })) 
          }),
        })
      } catch (error) {
        logger.error(`Failed to save cart to DB: ${error}`)
      } finally {
        cartSaveCompleted()
        endCartSave() // Unblock UI
        // หลัง save ทั้งหมดเสร็จ → revalidate SWR เพื่อ ensure consistency
        if (!hasCartSavesInFlight()) {
          globalMutate(getSWRCartKey(mcName))
        }
      }
    }, 800)
  }, [optimisticUpdateCache, startCartSave, endCartSave])

  // Immediate save (สำหรับ checkout ที่ต้อง await ให้เสร็จก่อน redirect)
  const saveCartImmediately = useCallback(async (items: CartItem[], minecraftName: string) => {
    // Clear any pending debounced save
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
      cartSaveCompleted()
    }
    pendingCartRef.current = null
    
    // ⚡ Optimistic cache update ทันที
    optimisticUpdateCache(items)
    
    cartSaveStarted()
    startCartSave()
    
    try {
      await apiFetch('/api/cart?quick=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          minecraftName, 
          items: items.map(i => ({ productId: i.product.id, quantity: i.quantity, customInput: i.customInput })) 
        }),
      })
    } catch (error) {
      logger.error(`Failed to save cart to DB: ${error}`)
    } finally {
      cartSaveCompleted()
      endCartSave() // Unblock UI
      if (!hasCartSavesInFlight()) {
        globalMutate(getSWRCartKey(minecraftName))
      }
    }
  }, [optimisticUpdateCache, startCartSave, endCartSave])

  // Cleanup debounce timer on unmount (let timer complete naturally)
  useEffect(() => {
    return () => {
      // Don't clear timer - let it complete to save pending changes
    }
  }, [])

  // Helper to generate unique key for cart items
  const getCartKey = (item: CartItem) => {
    return `${item.product.id}|${item.customInput || ''}`
  }

  const toggleSelectItem = (key: string) => {
    // Allow selection even if saving
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const selectAll = () => {
    setSelectedItems(new Set(cart.map(item => getCartKey(item))))
  }

  const selectNone = () => {
    setSelectedItems(new Set())
  }

  const updateQuantity = (key: string, delta: number) => {
    // Track which item is being modified to show localized spinner
    setModifyingItems(prev => new Set(prev).add(key))
    
    const itemToUpdate = cart.find(i => getCartKey(i) === key)
    
    // Check limits when increasing
    if (delta > 0 && itemToUpdate) {
      const limitCheck = canAddToCart(cart, itemToUpdate.quantity, delta)
      if (!limitCheck.allowed) {
        toastWarning(limitCheck.reason || 'เกินขีดจำกัด')
        // Remove from modifying set immediately if invalid
        setModifyingItems(prev => {
           const newSet = new Set(prev)
           newSet.delete(key)
           return newSet
        })
        return
      }
    }

    const newCart = cart
      .map((item) =>
        getCartKey(item) === key
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item
      )
      .filter((item) => item.quantity > 0)

    const removedItem = !newCart.find(item => getCartKey(item) === key)
    setCart(newCart)
    
    // Update cart count in header immediately
    const newCount = newCart.reduce((sum, item) => sum + item.quantity, 0)
    setCartCount(newCount)
    
    if (user) {
      // API Save (Debounced)
      debouncedSaveCart(newCart, user.minecraftName)
      
      if (removedItem) {
        toastSuccess('ลบสินค้าออกจากตะกร้าแล้ว')
      }
    } else {
      // Local only - clear loading state immediately (simulated delay)
      setTimeout(() => {
        setModifyingItems(prev => {
           const newSet = new Set(prev)
           newSet.delete(key)
           return newSet
        })
      }, 300)
    }
    
    // Remove from selected if deleted
    if (removedItem) {
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(key)
        return newSet
      })
    }
  }

  const removeItem = (key: string) => {
    setModifyingItems(prev => new Set(prev).add(key))
    
    const removedItem = cart.find(item => getCartKey(item) === key)
    const newCart = cart.filter((item) => getCartKey(item) !== key)
    setCart(newCart)
    
    // Update cart count in header immediately
    const newCount = newCart.reduce((sum, item) => sum + item.quantity, 0)
    setCartCount(newCount)
    
    if (user) {
      debouncedSaveCart(newCart, user.minecraftName)
      if (removedItem) {
        toastSuccess(`ลบ "${removedItem.product.name}" ออกจากตะกร้าแล้ว`)
      }
    } else {
      setTimeout(() => {
        setModifyingItems(prev => {
           const newSet = new Set(prev)
           newSet.delete(key)
           return newSet
        })
      }, 300)
    }
    
    // Remove from selected
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      return newSet
    })
  }

  const addToCart = useCallback((product: Product) => {
    // If not logged in, show login modal
    if (!user) {
      setShowLoginModal(true)
      return
    }

    // Use current cart state
    let currentCart = [...cart]
    
    const existing = currentCart.find((item) => item.product.id === product.id)
    const currentItemQuantity = existing?.quantity || 0
    
    // Check limits before adding
    const limitCheck = canAddToCart(currentCart, currentItemQuantity, 1)
    if (!limitCheck.allowed) {
      toastWarning(limitCheck.reason || 'เกินขีดจำกัด')
      return
    }
    
    if (existing) {
      currentCart = currentCart.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    } else {
      // Check max item types
      if (currentCart.length >= CART_LIMITS.MAX_ITEM_TYPES) {
        toastWarning(`เกินขีดจำกัด ${CART_LIMITS.MAX_ITEM_TYPES} ประเภทสินค้า`)
        return
      }
      currentCart = [...currentCart, { product, quantity: 1, customInput: null }]
    }
    
    // Optimistic update - update UI immediately
    setCart(currentCart)
    
    // Update cart count in header immediately (from local state)
    const newCount = currentCart.reduce((sum, item) => sum + item.quantity, 0)
    setCartCount(newCount)
    
    // Trigger cart badge animation on mobile
    if (triggerCartAnimation) {
      triggerCartAnimation()
    }
    
    // Show success toast
    toastSuccess(`เพิ่ม "${product.name}" ลงตะกร้าแล้ว`)
    
    // Debounced save to backend
    debouncedSaveCart(currentCart, user.minecraftName)
    
  }, [user, cart, setShowLoginModal, toastWarning, toastSuccess, debouncedSaveCart, triggerCartAnimation, setCartCount])

  // Calculate total for selected items only
  const selectedCart = cart.filter(item => selectedItems.has(getCartKey(item)))
  const selectedTotal = selectedCart.reduce(
    (sum, item) => sum + getProductActivePrice(item.product) * item.quantity,
    0
  )
  const selectedCount = selectedCart.reduce((sum, item) => sum + item.quantity, 0)

  // === สเตตคูปองส่วนลดเพิ่มเติม ===
  const [couponCode, setCouponCode] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string
    discountAmount: number
    finalTotal: number
    discountType: string
    discountValue: number
    maxDiscount: number | null
  } | null>(null)

  // คืนค่าคูปองส่วนลดเมื่อมีการแก้ไขความเคลื่อนไหวสินค้าที่ถูกเลือก หรือจำนวนชิ้นสินค้าเปลี่ยนไป ป้องกันส่วนลดคลาดเคลื่อน
  useEffect(() => {
    setAppliedCoupon(null)
  }, [selectedItems, cart])

  const handleApplyCoupon = async () => {
    if (!user) {
      setShowLoginModal(true)
      return
    }

    if (!couponCode.trim()) return

    setCouponLoading(true)
    try {
      const res = await apiFetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim(),
          minecraftName: user.minecraftName,
          items: selectedCart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity
          }))
        })
      })
      const data = await res.json()

      if (data.error) {
        toastError(data.error)
      } else {
        setAppliedCoupon({
          code: data.code,
          discountAmount: data.discountAmount,
          finalTotal: data.finalTotal,
          discountType: data.discountType,
          discountValue: data.discountValue,
          maxDiscount: data.maxDiscount
        })
        toastSuccess(`ใช้รหัสคูปอง "${data.code}" สำเร็จ! ลดทันที ฿${data.discountAmount.toFixed(2)}`)
      }
    } catch (err) {
      logger.error(`Coupon application error: ${err}`)
      toastError('เกิดข้อผิดพลาดในการตรวจสอบรหัสคูปอง')
    } finally {
      setCouponLoading(false)
    }
  }

  const handleCheckout = () => {
    if (!user) {
      setShowLoginModal(true)
      return
    }

    if (selectedItems.size === 0) {
      toastError('กรุณาเลือกสินค้าที่ต้องการซื้อ')
      return
    }

    if (hasPendingOrder) {
      toastError('คุณมีรายการที่รอชำระเงินอยู่แล้ว กรุณาชำระหรือยกเลิกก่อน')
      router.push('/shop/orders')
      return
    }

    setShowConfirmOnlineModal(true)
  }

  const proceedCheckout = async () => {
    if (!user) return
    setShowConfirmOnlineModal(false)
    setLoading(true)

    try {
      // Fetch CSRF Token
      const csrfRes = await apiFetch('/api/orders/csrf')
      const csrfData = await csrfRes.json()
      
      if (!csrfData.csrfToken || !csrfData.sessionId) {
        throw new Error('Failed to obtain security token')
      }

      const orderItems = selectedCart.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: getProductActivePrice(item.product),
        quantity: item.quantity,
        commands: item.product.commands || [],
        customInput: item.customInput,
      }))

      // Force immediate save if pending logic handles it or just proceed
      if (pendingCartRef.current) {
        // Handled automatically on checkout completion
      }

      const finalTotal = appliedCoupon ? appliedCoupon.finalTotal : selectedTotal

      const orderRes = await apiFetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minecraftName: user.minecraftName,
          items: orderItems,
          total: finalTotal,
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          action: 'create',
          sessionId: csrfData.sessionId,
          csrfToken: csrfData.csrfToken,
        }),
      })

      const orderData = await orderRes.json()

      if (orderData.error) {
        toastError(orderData.error)
        setLoading(false)
        return
      }

      // Remove selected items from cart
      const remainingCart = cart.filter(item => !selectedItems.has(getCartKey(item)))
      setCart(remainingCart)
      await saveCartImmediately(remainingCart, user.minecraftName)
      setSelectedItems(new Set())

      // Update badges immediately
      const newCount = remainingCart.reduce((sum, item) => sum + item.quantity, 0)
      setCartCount(newCount)
      updatePendingCount()

      toastSuccess('สร้างรายการสั่งซื้อเรียบร้อย')
      router.push('/shop/orders')
    } catch (err) {
      logger.error(`Error creating order: ${err}`)
      toastError('เกิดข้อผิดพลาดในการสร้างรายการ')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginSuccess = (loggedInUser: { id: string; minecraftName: string }) => {
    setUser(loggedInUser)
    setShowLoginModal(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2 animate-fade-in-down">
        <CartIcon size={24} />
        ตะกร้าสินค้า
      </h1>

        {initialLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <SkeletonCartItem />
              <SkeletonCartItem />
              <SkeletonCartItem />
            </div>
            <div>
              <div className="card p-6">
                <div className="skeleton w-1/2 h-6 mb-6" />
                <div className="skeleton w-full h-4 mb-4" />
                <div className="skeleton w-full h-4 mb-6" />
                <div className="skeleton w-full h-12" />
              </div>
            </div>
          </div>
        ) : cart.length === 0 ? (
          <div className="space-y-12 animate-fade-in">
            <div className="empty-state animate-scale-in">
              <div className="text-white animate-float-ambient mb-4 flex items-center justify-center">
                <CartIcon size={48} />
              </div>
              <h2 className="text-xl font-semibold mb-2">ตะกร้าสินค้าของคุณยังว่างเปล่า</h2>
              <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">
                เลือกดูสินค้าสุดพิเศษและสิทธิประโยชน์มากมายในร้านค้าเพื่อเพิ่มลงตะกร้าของคุณได้ทันที
              </p>
              <Link href="/shop" className="btn">
                ไปเลือกซื้อสินค้า
              </Link>
            </div>

            {/* ส่วนแสดงสินค้าแนะนำ */}
            {!isLoadingData && recommendedList && recommendedList.length > 0 && (
              <div className="animate-fade-in delay-200 flex flex-col items-center justify-center w-full">
                <div className="flex flex-col items-center justify-center mb-8 text-center">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1.5 w-1.5 bg-primary rounded-full"></div>
                    <h2 className="text-xl font-bold text-foreground">สินค้าแนะนำสำหรับคุณ</h2>
                    <div className="h-1.5 w-1.5 bg-primary rounded-full"></div>
                  </div>
                  <p className="text-muted-foreground text-xs max-w-md">
                    เลือกรับสิทธิประโยชน์และสินค้าจัดรายการโปรโมชันยอดนิยมที่เราคัดสรรมาให้คุณเป็นพิเศษ
                  </p>
                </div>
                
                <div className="flex justify-center w-full">
                  <div className="product-grid custom-recommend-grid justify-center w-full max-w-6xl">
                    {recommendedList.map((product, idx) => {
                      const activePrice = getProductActivePrice(product)
                      const onSale = isProductOnSale(product)
                      
                      const delayClass = 
                        idx === 0 ? 'delay-50' : 
                        idx === 1 ? 'delay-100' : 
                        idx === 2 ? 'delay-150' : 'delay-200'
                      
                      return (
                        <div 
                          key={product.id}
                          className={`product-card animate-scale-in ${delayClass}`}
                        >
                          <div className="product-image">
                            {product.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <PackageIcon size={32} />
                            )}
                            <span className="category-badge">{product.category?.name}</span>
                            {onSale && (
                              <div className="sale-ribbon">
                                {product.discountType === 'PERCENTAGE' ? `-${product.discountValue}%` : `-${product.discountValue}฿`}
                              </div>
                            )}
                          </div>

                          <div className="product-info">
                            <h3 className="product-name">{product.name}</h3>
                            {product.description && (
                              <p className="product-description">
                                {product.description}
                              </p>
                            )}
                            <p className="product-price">
                              {onSale ? (
                                <>
                                  <span className="original-price">฿{product.price.toLocaleString()}</span>
                                  <span className="sale-price"> ฿{activePrice.toLocaleString()} บาท</span>
                                </>
                              ) : (
                                `${product.price.toLocaleString()} บาท`
                              )}
                            </p>
                          </div>

                          <div className="product-actions">
                            <button
                              className={`btn btn-primary ${isCartSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => !isCartSaving && addToCart(product)}
                              disabled={isCartSaving}
                            >
                              <CartIcon size={16} />
                              เพิ่มลงตะกร้า
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4 animate-fade-in-left delay-100">
              {/* Select All / None */}
              <div className="flex items-center gap-4 mb-4 px-4 py-3 bg-muted rounded-lg">
                <button className="btn btn-sm" onClick={selectAll}>
                  <CheckIcon size={14} />
                  เลือกทั้งหมด
                </button>
                <button className="btn btn-sm btn-outline" onClick={selectNone}>
                  ยกเลิกทั้งหมด
                </button>
                <span className="text-muted-foreground text-sm ml-auto">
                  เลือก {selectedItems.size} / {cart.length} รายการ
                </span>
              </div>

              {cart.map((item, index) => {
                const delayClass = 
                  index === 0 ? 'delay-50' : 
                  index === 1 ? 'delay-100' : 
                  index === 2 ? 'delay-150' : 
                  index === 3 ? 'delay-200' : 'delay-250'
                
                return (
                  <div
                    key={getCartKey(item)}
                    className={`card cart-item-card animate-fade-in-left ${delayClass} transition-all duration-200 ${selectedItems.has(getCartKey(item)) ? 'opacity-100 border-2 border-primary' : 'opacity-60 border-2 border-transparent'}`}
                  >
                    {/* Checkbox */}
                    <label className="flex items-center cursor-pointer p-2">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(getCartKey(item))}
                        onChange={() => toggleSelectItem(getCartKey(item))}
                        className="w-5 h-5 cursor-pointer accent-primary"
                      />
                    </label>

                    {/* Product Image */}
                    <div className="cart-item-image w-20 h-20 bg-muted rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                      {item.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <PackageIcon size={32} />
                      )}
                    </div>

                    {/* Product Info + Price (Desktop) */}
                    <div className="cart-item-info flex-1 min-w-0 flex justify-between items-center gap-4">
                      <div>
                        <h3 className="font-semibold text-base">{item.product.name}</h3>
                        <p className="text-muted-foreground text-sm flex flex-wrap items-center gap-2 mt-1">
                          {isProductOnSale(item.product) ? (
                            <>
                              <span className="line-through opacity-60">
                                {item.product.price.toLocaleString()}
                              </span>
                              <span className="text-emerald-400 font-medium">
                                {getProductActivePrice(item.product).toLocaleString()}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase">
                                ลดราคา
                              </span>
                            </>
                          ) : (
                            <span>{item.product.price.toLocaleString()}</span>
                          )}
                          <span>บาท / ชิ้น</span>
                        </p>
                        {item.customInput && (
                          <p className="text-primary text-sm mt-1.5 font-mono truncate max-w-full flex items-center gap-2">
                            <span className="shrink-0 text-primary/70">Note:</span>
                            <span className="truncate text-primary/95">
                              {item.customInput.length > 15 ? item.customInput.slice(0, 15) + '...' : item.customInput}
                            </span>
                          </p>
                        )}
                      </div>
                      {/* Total Price - Shows on right in desktop, positioned via CSS on mobile */}
                      <div className="cart-item-price flex flex-col items-end">
                        {isProductOnSale(item.product) && (
                          <span className="text-xs line-through opacity-50 font-normal">
                            {(item.product.price * item.quantity).toLocaleString()} ฿
                          </span>
                        )}
                        <span className={isProductOnSale(item.product) ? "text-emerald-400 font-semibold text-lg" : "font-semibold text-lg"}>
                          {(getProductActivePrice(item.product) * item.quantity).toLocaleString()} ฿
                        </span>
                      </div>
                    </div>

                    {/* Quantity Controls + Delete */}
                    <div className="cart-item-controls">
                      <div className="cart-qty-controls">
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => updateQuantity(getCartKey(item), -1)}
                          disabled={modifyingItems.has(getCartKey(item))}
                          aria-label={`ลดจำนวน ${item.product.name}`}
                        >
                          <MinusIcon size={16} />
                        </button>
                        <span className="min-w-[32px] text-center font-medium">
                          {item.quantity}
                        </span>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => updateQuantity(getCartKey(item), 1)}
                          disabled={modifyingItems.has(getCartKey(item))}
                          aria-label={`เพิ่มจำนวน ${item.product.name}`}
                        >
                          <PlusIcon size={16} />
                        </button>
                      </div>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => removeItem(getCartKey(item))}
                        disabled={modifyingItems.has(getCartKey(item))}
                        aria-label={`ลบ ${item.product.name} ออกจากตะกร้า`}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="h-fit animate-fade-in-right delay-200">
              <div className="card sticky top-4">
                <h2 className="text-xl font-semibold mb-6">สรุปคำสั่งซื้อ</h2>
                
                <div className="flex justify-between mb-4 pb-4 border-b border-border">
                  <span className="text-muted-foreground">สินค้าที่เลือก ({selectedCount} ชิ้น)</span>
                  <span className="font-medium">{selectedTotal.toLocaleString()} บาท</span>
                </div>

                {/* ช่องกรอกคูปองส่วนลด */}
                {selectedItems.size > 0 && (
                  <div className="mb-4 pb-4 border-b border-border space-y-2">
                    <label className="text-sm font-medium text-muted-foreground block">
                      คูปองส่วนลด
                    </label>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-emerald-400 block truncate text-sm">
                            {appliedCoupon.code}
                          </span>
                          <span className="text-[11px] text-emerald-400/80 block">
                            ลดแล้ว -฿{appliedCoupon.discountAmount.toLocaleString()}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(null)
                            setCouponCode('')
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300 transition-colors font-medium shrink-0 ml-2"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="กรอกรหัสคูปอง"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          disabled={couponLoading}
                          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary flex-1 font-mono uppercase w-full"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading || !couponCode.trim()}
                          className="btn btn-sm btn-primary shrink-0"
                        >
                          {couponLoading ? 'ตรวจสอบ...' : 'ใช้งาน'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {appliedCoupon && (
                  <div className="flex justify-between mb-4 pb-4 border-b border-border text-sm">
                    <span className="text-muted-foreground">ส่วนลดคูปอง ({appliedCoupon.code})</span>
                    <span className="text-emerald-400 font-medium">
                      -฿{appliedCoupon.discountAmount.toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="flex justify-between mb-6 text-xl font-semibold">
                  <span>ยอดสุทธิ</span>
                  <span className="text-primary">
                    {(appliedCoupon ? appliedCoupon.finalTotal : selectedTotal).toLocaleString()} บาท
                  </span>
                </div>

                {hasPendingOrder && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 text-sm text-yellow-500">
                    ⚠️ คุณมีรายการรอชำระเงินอยู่
                  </div>
                )}

                <button
                  className="btn btn-primary btn-lg w-full"
                  onClick={handleCheckout}
                  disabled={loading || selectedItems.size === 0}
                >
                  {loading ? (
                    'กำลังสร้างรายการ...'
                  ) : hasPendingOrder ? (
                    'ไปหน้ารายการรอชำระ'
                  ) : user ? (
                    `สั่งซื้อ (${selectedItems.size} รายการ)`
                  ) : (
                    'เข้าสู่ระบบเพื่อซื้อ'
                  )}
                </button>
                
                {selectedItems.size === 0 && cart.length > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground text-center">
                    กรุณาเลือกสินค้าที่ต้องการซื้อ
                  </p>
                )}
              </div>
            </div>
          </div>
          </>
        )}

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />

      <ConfirmModal
        isOpen={showConfirmOnlineModal}
        title="คำแนะนำก่อนชำระเงิน"
        content={
          <>
            โปรดตรวจสอบว่าคุณกำลังออนไลน์ในเซิร์ฟเวอร์ Minecraft<br />
            หากคุณยังไม่ได้เข้าเกม กรุณาเข้าเกมก่อนแล้วกลับมากดยืนยัน
          </>
        }
        confirmText="รับทราบและดำเนินการต่อ"
        cancelText="ยกเลิก"
        onConfirm={proceedCheckout}
        onCancel={() => setShowConfirmOnlineModal(false)}
      />

      <style jsx>{`
        @media (min-width: 1024px) {
          :global(.custom-recommend-grid) {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }
        }
      `}</style>
    </div>
  )
}
