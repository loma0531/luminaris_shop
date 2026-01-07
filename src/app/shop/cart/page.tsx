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
  const [initialLoading, setInitialLoading] = useState(true)
  const [hasPendingOrder, setHasPendingOrder] = useState(false)
  const router = useRouter()
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast()
  const { setCartCount, updatePendingCount } = useShop()
  
  // Debounce timer for cart sync to prevent race conditions
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const initCart = async () => {
      const storedUser = localStorage.getItem('user')
      let userObj: User | null = null

      if (storedUser) {
        try {
          userObj = JSON.parse(storedUser)
          setUser(userObj)
        } catch {
          localStorage.removeItem('user')
          localStorage.removeItem('shopToken')
        }
        
        // Check for pending order
        try {
          const res = await apiFetch('/api/orders/latest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minecraftName: userObj!.minecraftName }),
          })
          const data = await res.json()
          if (data.found) {
            setHasPendingOrder(true)
          }
        } catch (e) {
          logger.error(`Error checking pending order: ${e}`)
        }
      }

      if (userObj) {
        // Always fetch from DB (source of truth)
        try {
          const res = await apiFetch(`/api/cart?minecraftName=${userObj.minecraftName}`)
          const data = await res.json()
          const dbItems: CartItem[] = data.items || []
          setCart(dbItems)
          setSelectedItems(new Set())
        } catch (error) {
          logger.error(`Error fetching cart from DB: ${error}`)
          setCart([])
          setSelectedItems(new Set())
        }
      } else {
        // No user logged in - show empty cart
        setCart([])
        setSelectedItems(new Set())
      }
      setInitialLoading(false)
    }

    initCart()
  }, [])

  // Ref to store pending cart for flush on unmount
  const pendingCartRef = useRef<{ items: CartItem[], minecraftName: string } | null>(null)

  // Debounced cart sync - batches rapid clicks into single API call
  // Using empty deps for stable function reference
  const debouncedSaveCart = useCallback((items: CartItem[], minecraftName: string) => {
    // Store pending cart
    pendingCartRef.current = { items, minecraftName }
    
    // Clear any pending sync
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
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
        // Don't call updateCartCount here - causes extra GET requests
      } catch (error) {
        logger.error(`Failed to save cart to DB: ${error}`)
      }
    }, 800)
  }, []) // Empty deps for stable reference

  // Immediate save (for checkout - must complete before redirect)
  const saveCartImmediately = useCallback(async (items: CartItem[], minecraftName: string) => {
    // Clear any pending debounced save
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    pendingCartRef.current = null
    
    try {
      await apiFetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          minecraftName, 
          items: items.map(i => ({ productId: i.product.id, quantity: i.quantity, customInput: i.customInput })) 
        }),
      })
    } catch (error) {
      logger.error(`Failed to save cart to DB: ${error}`)
    }
  }, [])

  // Cleanup debounce timer on unmount (let timer complete naturally)
  useEffect(() => {
    return () => {
      // Don't clear timer - let it complete to save pending changes
    }
  }, [])

  const toggleSelectItem = (productId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      return newSet
    })
  }

  const selectAll = () => {
    setSelectedItems(new Set(cart.map(item => item.product.id)))
  }

  const selectNone = () => {
    setSelectedItems(new Set())
  }

  const updateQuantity = (productId: string, delta: number) => {
    // Check limits when increasing
    if (delta > 0) {
      const item = cart.find(i => i.product.id === productId)
      if (item) {
        const limitCheck = canAddToCart(cart, item.quantity, delta)
        if (!limitCheck.allowed) {
          toastWarning(limitCheck.reason || 'เกินขีดจำกัด')
          return
        }
      }
    }

    const newCart = cart
      .map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item
      )
      .filter((item) => item.quantity > 0)

    const removedItem = !newCart.find(item => item.product.id === productId)
    setCart(newCart)
    
    // Update cart count in header immediately
    const newCount = newCart.reduce((sum, item) => sum + item.quantity, 0)
    setCartCount(newCount)
    
    if (user) {
      // Use debounced save to batch rapid clicks
      debouncedSaveCart(newCart, user.minecraftName)
      
      // Toast notification only when item is removed
      if (removedItem) {
        toastSuccess('ลบสินค้าออกจากตะกร้าแล้ว')
      }
    }
    
    // Remove from selected if deleted
    if (removedItem) {
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(productId)
        return newSet
      })
    }
  }

  const removeItem = async (productId: string) => {
    const removedProduct = cart.find(item => item.product.id === productId)
    const newCart = cart.filter((item) => item.product.id !== productId)
    setCart(newCart)
    
    // Update cart count in header immediately
    const newCount = newCart.reduce((sum, item) => sum + item.quantity, 0)
    setCartCount(newCount)
    
    if (user) {
      // Save to DB immediately
      await saveCartImmediately(newCart, user.minecraftName)
      
      // Toast notification
      if (removedProduct) {
        toastSuccess(`ลบ "${removedProduct.product.name}" ออกจากตะกร้าแล้ว`)
      }
    }
    
    // Remove from selected
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(productId)
      return newSet
    })
  }

  // Calculate total for selected items only
  const selectedCart = cart.filter(item => selectedItems.has(item.product.id))
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
      const remainingCart = cart.filter(item => !selectedItems.has(item.product.id))
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
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
              <div className="card" style={{ padding: '1.5rem' }}>
                <div className="skeleton" style={{ width: '50%', height: '1.5rem', marginBottom: '1.5rem' }} />
                <div className="skeleton" style={{ width: '100%', height: '1rem', marginBottom: '1rem' }} />
                <div className="skeleton" style={{ width: '100%', height: '1rem', marginBottom: '1.5rem' }} />
                <div className="skeleton" style={{ width: '100%', height: '3rem' }} />
              </div>
            </div>
          </div>
        ) : cart.length === 0 ? (
          <div className="empty-state">
            <CartIcon size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <p>ตะกร้าว่างเปล่า</p>
            <Link href="/shop" className="btn" style={{ marginTop: '1rem' }}>
              ไปดูสินค้า
            </Link>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {/* Select All / None */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem', 
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: 'var(--muted)',
                borderRadius: '0.5rem',
              }}>
                <button className="btn btn-sm" onClick={selectAll}>
                  <CheckIcon size={14} />
                  เลือกทั้งหมด
                </button>
                <button className="btn btn-sm btn-outline" onClick={selectNone}>
                  ยกเลิกทั้งหมด
                </button>
                <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', marginLeft: 'auto' }}>
                  เลือก {selectedItems.size} / {cart.length} รายการ
                </span>
              </div>

              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="card cart-item-card"
                  style={{ 
                    opacity: selectedItems.has(item.product.id) ? 1 : 0.6,
                    border: selectedItems.has(item.product.id) ? '2px solid var(--primary)' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Checkbox */}
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    padding: '0.5rem',
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.product.id)}
                      onChange={() => toggleSelectItem(item.product.id)}
                      style={{
                        width: 20,
                        height: 20,
                        cursor: 'pointer',
                        accentColor: 'var(--primary)',
                      }}
                    />
                  </label>

                  {/* Product Image */}
                  <div className="cart-item-image" style={{
                    width: 80,
                    height: 80,
                    background: 'var(--muted)',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    {item.product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <PackageIcon size={32} />
                    )}
                  </div>

                  {/* Product Info + Price (Desktop) */}
                  <div className="cart-item-info" style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>{item.product.name}</h3>
                      <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                        {item.product.price.toLocaleString()} บาท / ชิ้น
                      </p>
                      {item.customInput && (
                        <p style={{ 
                          color: 'var(--primary)', 
                          fontSize: '0.875rem', 
                          marginTop: '0.25rem', 
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <span style={{ flexShrink: 0 }}>Note:</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        onClick={() => updateQuantity(item.product.id, -1)}
                      >
                        <MinusIcon size={16} />
                      </button>
                      <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 500 }}>{item.quantity}</span>
                      <button
                        className="btn btn-icon btn-sm"
                        onClick={() => updateQuantity(item.product.id, 1)}
                      >
                        <PlusIcon size={16} />
                      </button>
                    </div>
                    <button
                      className="btn btn-danger btn-icon btn-sm"
                      onClick={() => removeItem(item.product.id)}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-fit">
              <div className="card sticky top-4">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>สรุปคำสั่งซื้อ</h2>
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginBottom: '1rem',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid var(--border)' 
                }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>สินค้าที่เลือก ({selectedCount} ชิ้น)</span>
                  <span style={{ fontWeight: 500 }}>{selectedTotal.toLocaleString()} บาท</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ color: 'var(--primary)' }}>{selectedTotal.toLocaleString()} บาท</span>
                </div>

                {hasPendingOrder && (
                  <div style={{
                    background: 'rgba(255, 200, 0, 0.1)',
                    border: '1px solid rgba(255, 200, 0, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                    color: '#ffc800',
                  }}>
                    ⚠️ คุณมีรายการรอชำระเงินอยู่
                  </div>
                )}

                <button
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  onClick={handleCheckout}
                  disabled={loading || selectedItems.size === 0}
                >
                  {loading ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16 }} />
                      กำลังสร้างรายการ...
                    </>
                  ) : hasPendingOrder ? (
                    'ไปหน้ารายการรอชำระ'
                  ) : user ? (
                    `สั่งซื้อ (${selectedItems.size} รายการ)`
                  ) : (
                    'เข้าสู่ระบบเพื่อซื้อ'
                  )}
                </button>
                
                {selectedItems.size === 0 && cart.length > 0 && (
                  <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
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
