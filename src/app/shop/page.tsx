'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useShop, type Product, type CartItem } from './layout'
import { 
  CartIcon, 
  PackageIcon, 
  TagIcon,
  CheckIcon,
} from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { useToast } from '@/context/ToastContext'
import { CART_LIMITS, canAddToCart } from '@/lib/cartLimits'
import { logger } from '@/lib/logger'
import { validateCustomInput } from '@/lib/inputValidation'
import { getCartKey } from '@/lib/swr-hooks'
import { mutate as globalMutate } from 'swr'
import { cartSaveStarted, cartSaveCompleted, hasCartSavesInFlight } from '@/lib/cartSaveTracker'
import { SkeletonProductCard } from '@/components/Skeleton'
import { getProductActivePrice, isProductOnSale } from '@/lib/productPricing'

// Product Image with error handling and fallback
function ProductImage({ src, alt, priority = false }: { src: string | null; alt: string; priority?: boolean }) {
  const [error, setError] = useState(false)
  
  if (!src || error) {
    return (
      <div className="product-image-placeholder">
        <PackageIcon size={32} />
      </div>
    )
  }
  
  return (
    <Image 
      src={src} 
      alt={alt} 
      fill 
      className="object-cover"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      onError={() => setError(true)}
      priority={priority}
    />
  )
}

export default function ShopPage() {
  const { 
    user, 
    setCartCount, 
    setShowLoginModal, 
    triggerCartAnimation,
    products,
    categories,
    isLoadingData: loading,
    startCartSave,
    endCartSave,
    isCartSaving
  } = useShop()

  
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const { warning: toastWarning, success: toastSuccess, error: toastError } = useToast()
  
  // State สำหรับ custom input modal
  const [showInputModal, setShowInputModal] = useState(false)
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)
  const [customInputValue, setCustomInputValue] = useState('')
  
  // State สำหรับ custom dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounce timer ref for batching cart saves
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingCartRef = useRef<CartItem[] | null>(null)

  useEffect(() => {
    loadCart()
  }, [])

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

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category?.id === selectedCategory)
    : products

  // Use refs to avoid stale closures in debounce
  const userRef = useRef(user)
  userRef.current = user

  // Debounced save function - batches multiple adds into one API call
  // Using empty deps to ensure stable function reference
  const debouncedSaveCart = useCallback((newCart: CartItem[]) => {
    const currentUser = userRef.current
    if (!currentUser) return
    
    // ⚡ Optimistic update
    const newCount = newCart.reduce((sum, item) => sum + item.quantity, 0)
    globalMutate(
      getCartKey(currentUser.minecraftName),
      { items: newCart, count: newCount },
      { revalidate: false }
    )
    
    // Track save in shared tracker AND global context
    cartSaveStarted()
    startCartSave()
    
    // Always update pending cart to latest state
    pendingCartRef.current = newCart
    
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      // Note: We don't call endCartSave() here because we are just resetting the timer,
      // the "save process" as a whole is still ongoing from the user's perspective.
      cartSaveCompleted() // cancel internal counter
    }
    
    // Set new timer
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
      } catch (error) {
        logger.error(`Failed to save cart to DB: ${error}`)
      } finally {
        cartSaveCompleted()
        endCartSave() // Unblock UI
        if (!hasCartSavesInFlight()) {
          globalMutate(getCartKey(currentUser.minecraftName))
        }
      }
    }, 800)
  }, [startCartSave, endCartSave])

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
        
        cartSaveStarted()
        apiFetch('/api/cart?quick=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              minecraftName: currentUser.minecraftName, 
              items: cartToSave.map(i => ({ productId: i.product.id, quantity: i.quantity, customInput: i.customInput })) 
            }),
            keepalive: true
        })
        .then(() => {
          cartSaveCompleted()
          if (!hasCartSavesInFlight()) {
            globalMutate(getCartKey(currentUser.minecraftName))
          }
        })
        .catch(err => {
          console.error('Failed to save cart on unmount', err)
          cartSaveCompleted()
        })
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
    const validation = validateCustomInput(customInputValue)
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

        /* Sale Ribbon & Price Styles */
        .sale-ribbon {
          position: absolute;
          top: 12px;
          left: 12px;
          background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
          color: #ffffff;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
          z-index: 10;
          letter-spacing: 0.5px;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .original-price {
          color: var(--muted-foreground);
          text-decoration: line-through;
          font-size: 0.85rem;
          margin-right: 0.35rem;
          opacity: 0.75;
        }
        .sale-price {
          color: #f87171;
          font-weight: 700;
        }
      `}</style>
      
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <PackageIcon size={24} />
        สินค้าทั้งหมด
      </h1>

      {/* Custom Category Filter Dropdown */}
      <div className="category-filter-wrapper">
        <div className="filter-label">
          <TagIcon size={18} />
          <span>หมวดหมู่:</span>
        </div>
        
        <div className="custom-dropdown" ref={dropdownRef}>
          <button 
            className={`dropdown-trigger ${isDropdownOpen ? 'active' : ''}`}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span>
              {selectedCategory 
                ? categories.find(c => c.id === selectedCategory)?.name || 'เลือกหมวดหมู่' 
                : 'ทุกหมวดหมู่'}
            </span>
            <div className="dropdown-arrow">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>
          
          <div className={`dropdown-menu ${isDropdownOpen ? 'open' : ''}`}>
            <button
              className={`dropdown-item ${!selectedCategory ? 'selected' : ''}`}
              onClick={() => {
                setSelectedCategory('')
                setIsDropdownOpen(false)
              }}
            >
              <span>ทุกหมวดหมู่</span>
              <div className="item-check"><CheckIcon size={14} /></div>
            </button>
            
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`dropdown-item ${selectedCategory === cat.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedCategory(cat.id)
                  setIsDropdownOpen(false)
                }}
              >
                <span>{cat.name}</span>
                <div className="item-check"><CheckIcon size={14} /></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonProductCard key={i} />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <PackageIcon size={48} className="mb-4 opacity-50" />
          <p>ยังไม่มีสินค้าในหมวดหมู่นี้</p>
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product, index) => {
            const onSale = isProductOnSale(product)
            const activePrice = getProductActivePrice(product)
            
            return (
              <div key={product.id} className="product-card">
                <div className="product-image">
                  <ProductImage src={product.image} alt={product.name} priority={index < 4} />
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
      )}

      {/* Custom Input Modal */}
      {showInputModal && pendingProduct && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4"
          onClick={() => !isCartSaving && setShowInputModal(false)}
        >
          <div 
            className="card max-w-[500px] w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold">
              {pendingProduct.inputLabel || 'กรอกข้อมูลเพิ่มเติม'}
            </h2>
            <p className="mb-4 text-muted-foreground text-sm">
              สินค้า: <strong>{pendingProduct.name}</strong> - {pendingProduct.price.toLocaleString()} บาท
            </p>
            
            <input
              type="text"
              value={customInputValue}
              onChange={(e) => setCustomInputValue(e.target.value)}
              placeholder={pendingProduct.inputPlaceholder || 'เช่น &a&lYourName หรือ &#FF00FFYourName'}
              className="input mb-6 font-mono"
              autoFocus
              disabled={isCartSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCartSaving) {
                  handleConfirmCustomInput()
                }
              }}
            />
            
            <div className="flex gap-3">
              <button
                className="btn flex-1 bg-muted"
                onClick={() => setShowInputModal(false)}
                disabled={isCartSaving}
              >
                ยกเลิก
              </button>
              <button
                className="btn btn-primary flex-1"
                onClick={handleConfirmCustomInput}
                disabled={isCartSaving}
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
