'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useShop } from './layout'
import { 
  CartIcon, 
  PackageIcon, 
  GridIcon,
  TagIcon,
} from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { useToast } from '@/context/ToastContext'
import { CART_LIMITS, canAddToCart } from '@/lib/cartLimits'
import { logger } from '@/lib/logger'
import { validateNickColorCode } from '@/lib/nickColorValidation'

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  image: string | null
  commands: string[]
  requiresInput?: boolean
  inputLabel?: string | null
  inputPlaceholder?: string | null
  category: {
    id: string
    name: string
  }
}

interface CartItem {
  product: Product
  quantity: number
  customInput?: string | null
}

interface Category {
  id: string
  name: string
  image?: string | null
  icon?: string | null
}

// Product Image with error handling and fallback
function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [error, setError] = useState(false)
  
  if (!src || error) {
    return <PackageIcon size={40} />
  }
  
  return (
    <Image 
      src={src} 
      alt={alt} 
      fill 
      style={{ objectFit: 'cover' }}
      unoptimized={src.startsWith('/uploads/')} // Skip optimization for local images
      onError={() => setError(true)}
    />
  )
}

export default function ShopPage() {
  const { user, setCartCount, setShowLoginModal, triggerCartAnimation } = useShop()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const { warning: toastWarning, success: toastSuccess, error: toastError } = useToast()
  
  // State สำหรับ custom input modal
  const [showInputModal, setShowInputModal] = useState(false)
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)
  const [customInputValue, setCustomInputValue] = useState('')
  
  // Debounce timer ref for batching cart saves
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingCartRef = useRef<CartItem[] | null>(null)

  useEffect(() => {
    initShopData()
  }, [])

  const initShopData = async () => {
    setLoading(true)
    const storedUser = localStorage.getItem('user')
    let userQuery = ''
    
    if (storedUser) {
      try {
        const userObj = JSON.parse(storedUser)
        if (userObj.minecraftName) {
           userQuery = `?minecraftName=${userObj.minecraftName}`
        }
      } catch (e) {
        logger.error(`User parse error: ${e}`)
        localStorage.removeItem('user')
        localStorage.removeItem('shopToken')
      }
    }

    try {
      // ⚡ SUPER FAST: 1 Request for EVERYTHING
      const res = await apiFetch(`/api/shop/init${userQuery}`)
      const data = await res.json()
      
      if (data.products) setProducts(data.products)
      if (data.categories) setCategories(data.categories)
      if (data.cart) {
        setCart(data.cart)
        setCartCount(data.cart.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0))
      }
      if (data.pendingOrders !== undefined) {
          // Update via context if simple method exists, otherwise ignore for now
          // The sidebar will fetch its own pending count separate or we can expose a setter
      }

    } catch (error) {
       logger.error(`Fast Init Failed, falling back to slow init: ${error}`)
       // Fallback
       fetchProducts()
       fetchCategories()
       if(userQuery) loadCart()
    } finally {
      setLoading(false)
    }
  }

  // Fallback methods kept for robustness
  const loadCart = async () => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const userObj = JSON.parse(storedUser)
        const res = await apiFetch(`/api/cart?minecraftName=${userObj.minecraftName}`)
        const data = await res.json()
        setCart(data.items || [])
      } catch (error) {
        logger.error(`Error loading cart: ${error}`)
      }
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products')
      const data = await res.json()
      setProducts(data.filter((p: Product & { isActive: boolean }) => p.isActive))
    } catch (error) {
      logger.error(`Error fetching products: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/categories')
      const data = await res.json()
      setCategories(data)
    } catch (error) {
      logger.error(`Error fetching categories: ${error}`)
    }
  }

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category.id === selectedCategory)
    : products

  // Use refs to avoid stale closures in debounce
  const userRef = useRef(user)
  userRef.current = user
  
  // Debounced save function - batches multiple adds into one API call
  // Using empty deps to ensure stable function reference
  const debouncedSaveCart = useCallback((newCart: CartItem[]) => {
    const currentUser = userRef.current
    if (!currentUser) return
    
    // Always update pending cart to latest state
    pendingCartRef.current = newCart
    
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    
    // Set new timer - wait 800ms of inactivity before saving
    saveTimerRef.current = setTimeout(async () => {
      if (!pendingCartRef.current) return
      
      const cartToSave = pendingCartRef.current
      pendingCartRef.current = null
      saveTimerRef.current = null
      
      try {
        await apiFetch('/api/cart?quick=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            minecraftName: currentUser.minecraftName, 
            items: cartToSave.map(i => ({ productId: i.product.id, quantity: i.quantity, customInput: i.customInput })) 
          }),
        })
        // Don't call updateCartCount here - it causes extra GET requests
        // The cart state is already updated optimistically
      } catch (error) {
        logger.error(`Failed to save cart to DB: ${error}`)
      }
    }, 800)
  }, []) // Empty deps - uses refs for latest values

  // Ensure pending changes are saved when navigating away
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      
      // If there are pending changes, save them immediately
      if (pendingCartRef.current && userRef.current) {
        const cartToSave = pendingCartRef.current
        const currentUser = userRef.current
        
        // Use fetch directly for “fire and forget” during unmount
        // Note: keeping keepalive: true might help in some browsers but strictly fetch is okay
        // We use apiFetch but need to catch errors to avoid unhandled rejections
        apiFetch('/api/cart?quick=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              minecraftName: currentUser.minecraftName, 
              items: cartToSave.map(i => ({ productId: i.product.id, quantity: i.quantity, customInput: i.customInput })) 
            }),
            keepalive: true // Important for ensuring request completes after unload
        }).catch(err => console.error('Failed to save cart on unmount', err))
      }
    }
  }, [])

  const addToCart = useCallback((product: Product, customInput?: string) => {
    // If not logged in, show login modal
    if (!user) {
      setShowLoginModal(true)
      return
    }

    // ถ้าสินค้าต้องการ input และยังไม่มี input ให้เปิด modal
    if (product.requiresInput && !customInput) {
      setPendingProduct(product)
      setCustomInputValue('')
      setShowInputModal(true)
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
      // สำหรับสินค้าที่ต้องการ input ต้องเพิ่มใหม่แทนที่จะรวม quantity
      if (product.requiresInput) {
        currentCart = [...currentCart, { product, quantity: 1, customInput }]
      } else {
        currentCart = currentCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
    } else {
      // Check max item types
      if (currentCart.length >= CART_LIMITS.MAX_ITEM_TYPES) {
        toastWarning(`เกินขีดจำกัด ${CART_LIMITS.MAX_ITEM_TYPES} ประเภทสินค้า`)
        return
      }
      currentCart = [...currentCart, { product, quantity: 1, customInput }]
    }
    
    // Optimistic update - update UI immediately
    setCart(currentCart)
    
    // Update cart count in header immediately (from local state)
    const newCount = currentCart.reduce((sum, item) => sum + item.quantity, 0)
    setCartCount(newCount)
    
    // Trigger cart badge animation on mobile
    triggerCartAnimation()
    
    // Show success toast
    toastSuccess(`เพิ่ม "${product.name}" ลงตะกร้าแล้ว`)
    
    // Debounced save to backend
    debouncedSaveCart(currentCart)
    
  }, [user, cart, setShowLoginModal, toastWarning, toastSuccess, debouncedSaveCart, triggerCartAnimation, setCartCount])

  // ฟังก์ชันเมื่อ confirm custom input modal
  const handleConfirmCustomInput = useCallback(() => {
    if (!pendingProduct) return
    
    // Validate input ด้วย validateNickColorCode
    const validation = validateNickColorCode(customInputValue)
    if (!validation.valid) {
      toastError(validation.error || 'โค้ดสีไม่ถูกต้อง')
      return
    }
    
    // เพิ่มลงตะกร้าพร้อม input
    addToCart(pendingProduct, customInputValue.trim())
    
    // ปิด modal
    setShowInputModal(false)
    setPendingProduct(null)
    setCustomInputValue('')
  }, [pendingProduct, customInputValue, addToCart, toastError])

  return (
    <div>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .loading-spinner {
          animation: spin 1s linear infinite;
        }
      `}</style>
      
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <PackageIcon size={24} />
        สินค้าทั้งหมด
      </h1>

      {/* Category Filter */}
      <div className="category-filter">
        <button
          className={`category-btn ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory('')}
        >
          <GridIcon size={18} />
          ทั้งหมด
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            <TagIcon size={18} />
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: '1rem' }}>
              <div className="skeleton" style={{ width: '100%', height: 120, marginBottom: '1rem' }} />
              <div className="skeleton" style={{ width: '60%', height: '1.25rem', marginBottom: '0.5rem' }} />
              <div className="skeleton" style={{ width: '40%', height: '1rem', marginBottom: '0.75rem' }} />
              <div className="skeleton" style={{ width: '100%', height: 40 }} />
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <PackageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>ยังไม่มีสินค้าในหมวดหมู่นี้</p>
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product) => {
            return (
              <div key={product.id} className="product-card">
                <div className="product-image">
                  <ProductImage src={product.image} alt={product.name} />
                </div>
                <div className="product-info">
                  <h3 className="product-name">{product.name}</h3>
                  {product.description && (
                    <p className="product-description">
                      {product.description}
                    </p>
                  )}
                  <p className="product-price">
                    {product.price.toLocaleString()} บาท
                  </p>
                </div>
                <div className="product-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => addToCart(product)}
                  >
                    <CartIcon size={16} />
                    เพิ่มลงตะกร้า
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Custom Input Modal */}
      {showInputModal && pendingProduct && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setShowInputModal(false)}
        >
          <div 
            className="card"
            style={{
              maxWidth: '500px',
              width: '100%',
              padding: '1.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 600 }}>
              {pendingProduct.inputLabel || 'กรอกข้อมูลเพิ่มเติม'}
            </h2>
            <p style={{ marginBottom: '1rem', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
              สินค้า: <strong>{pendingProduct.name}</strong> - {pendingProduct.price.toLocaleString()} บาท
            </p>
            
            <input
              type="text"
              value={customInputValue}
              onChange={(e) => setCustomInputValue(e.target.value)}
              placeholder={pendingProduct.inputPlaceholder || 'เช่น &a&lYourName หรือ &#FF00FFYourName'}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-background)',
                color: 'var(--color-text)',
                fontSize: '1rem',
                marginBottom: '1.5rem',
                fontFamily: 'monospace'
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmCustomInput()
                }
              }}
            />
            

            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--color-background-elevated)' }}
                onClick={() => setShowInputModal(false)}
              >
                ยกเลิก
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleConfirmCustomInput}
              >
                <CartIcon size={16} />
                เพิ่มลงตะกร้า
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
