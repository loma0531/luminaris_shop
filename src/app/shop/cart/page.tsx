'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoginModal from '@/components/LoginModal'
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
import { canAddToCart } from '@/lib/cartLimits'
import { logger } from '@/lib/logger'
import { useCart, getCartKey as getSWRCartKey } from '@/lib/swr-hooks'
import { mutate as globalMutate } from 'swr'
import { cartSaveStarted, cartSaveCompleted, hasCartSavesInFlight } from '@/lib/cartSaveTracker'


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

  const router = useRouter()
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast()
  const { setCartCount, updatePendingCount, startCartSave, endCartSave, isCartSaving } = useShop()
  
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

  // Calculate total for selected items only
  const selectedCart = cart.filter(item => selectedItems.has(getCartKey(item)))
  const selectedTotal = selectedCart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  const selectedCount = selectedCart.reduce((sum, item) => sum + item.quantity, 0)

  const handleCheckout = async () => {
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
        price: item.product.price,
        quantity: item.quantity,
        commands: item.product.commands || [],
        customInput: item.customInput,
      }))

      // Force immediate save if pending logic handles it or just proceed
      // If a pending cart save exists, api/cart?quick=true might race with checkout?
      // Checkout creates order. Cart save updates cart. They are distinct.
      // But we should probably flush pending cart saves first.
      
      if (pendingCartRef.current) {
        // Save pending cart first to ensure DB is consistent before order creation?
        // Actually handleCheckout clears selected items from cart locally and saves remaining.
        // So we don't need to flush the *previous* pending cart if we are about to overwrite it.
        // We just need to make sure we save the *final* state after checkout.
      }

      const orderRes = await apiFetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minecraftName: user.minecraftName,
          items: orderItems,
          total: selectedTotal,
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
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
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
          <div className="empty-state">
            <CartIcon size={48} className="mb-4 opacity-50" />
            <p>ตะกร้าว่างเปล่า</p>
            <Link href="/shop" className="btn mt-4">
              ไปดูสินค้า
            </Link>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
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

              {cart.map((item) => (
                <div
                  key={getCartKey(item)}
                  className={`card cart-item-card transition-all duration-200 ${selectedItems.has(getCartKey(item)) ? 'opacity-100 border-2 border-primary' : 'opacity-60 border-2 border-transparent'}`}
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
                      <p className="text-muted-foreground text-sm">
                        {item.product.price.toLocaleString()} บาท / ชิ้น
                      </p>
                      {item.customInput && (
                        <p className="text-primary text-sm mt-1 font-mono truncate max-w-full flex items-center gap-2">
                          <span className="shrink-0">Note:</span>
                          <span className="truncate">
                            {item.customInput.length > 15 ? item.customInput.slice(0, 15) + '...' : item.customInput}
                          </span>
                        </p>
                      )}
                    </div>
                    {/* Total Price - Shows on right in desktop, positioned via CSS on mobile */}
                    <div className="cart-item-price">
                      {(item.product.price * item.quantity).toLocaleString()} ฿
                    </div>
                  </div>

                  {/* Quantity Controls + Delete */}
                  <div className="cart-item-controls">
                    <div className="cart-qty-controls">
                      <button
                        className="btn btn-icon btn-sm"
                        onClick={() => updateQuantity(getCartKey(item), -1)}
                        disabled={modifyingItems.has(getCartKey(item))}
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
                      >
                        <PlusIcon size={16} />
                      </button>
                    </div>
                    <button
                      className="btn btn-danger btn-icon btn-sm"
                      onClick={() => removeItem(getCartKey(item))}
                      disabled={modifyingItems.has(getCartKey(item))}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-fit">
              <div className="card sticky top-4">
                <h2 className="text-xl font-semibold mb-6">สรุปคำสั่งซื้อ</h2>
                
                <div className="flex justify-between mb-4 pb-4 border-b border-border">
                  <span className="text-muted-foreground">สินค้าที่เลือก ({selectedCount} ชิ้น)</span>
                  <span className="font-medium">{selectedTotal.toLocaleString()} บาท</span>
                </div>

                <div className="flex justify-between mb-6 text-xl font-semibold">
                  <span>ยอดสุทธิ</span>
                  <span className="text-primary">{selectedTotal.toLocaleString()} บาท</span>
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
    </div>
  )
}
