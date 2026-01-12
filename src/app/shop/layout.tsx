'use client'

import React, { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import LoginModal from '@/components/LoginModal'
import ConfirmModal from '@/components/ConfirmModal'
import {
  CartIcon,
  PackageIcon,
  ClockIcon,
  HistoryIcon,
  LogoutIcon,
  UserIcon,
  GridIcon,
  MenuIcon,
  WalletIcon,
} from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'

export interface Product {
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

export interface Category {
  id: string
  name: string
  image?: string | null
  icon?: string | null
}

export interface CartItem {
  product: Product
  quantity: number
  customInput?: string | null
}

interface User {
  id: string
  minecraftName: string
}

interface ShopContextType {
  user: User | null
  setUser: (user: User | null) => void
  cartCount: number
  setCartCount: (count: number) => void
  updateCartCount: () => void
  pendingOrderCount: number
  updatePendingCount: () => void
  showLoginModal: boolean
  setShowLoginModal: (show: boolean) => void
  triggerCartAnimation: () => void
  // Client-side cache data
  products: Product[]
  categories: Category[]
  isLoadingData: boolean
  refreshData: (force?: boolean) => Promise<void>
}

const ShopContext = createContext<ShopContextType | null>(null)

export function useShop() {
  const context = useContext(ShopContext)
  if (!context) {
    throw new Error('useShop must be used within ShopLayout')
  }
  return context
}

// Helper to get skin name (remove BR_ prefix for Bedrock players)
function getSkinName(minecraftName: string): string {
  if (minecraftName.startsWith('BR_')) {
    return minecraftName.substring(3)
  }
  return minecraftName
}

// Chevron Icon for collapsible
const ChevronIcon = ({ size = 16, expanded }: { size?: number; expanded: boolean }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={`transition-transform duration-200 ${expanded ? 'rotate-180' : 'rotate-0'}`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

function ShopSidebar({ 
  cartCount, 
  pendingOrderCount,
  mobileOpen,
  onCloseMobile,
}: { 
  cartCount: number
  pendingOrderCount: number
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const pathname = usePathname()
  const [shopExpanded, setShopExpanded] = useState(true)
  const [ordersExpanded, setOrdersExpanded] = useState(true)
  const [accountExpanded, setAccountExpanded] = useState(true)

  const isActive = (href: string) => {
    if (!pathname) return false
    if (href === '/shop') {
      return pathname === '/shop'
    }
    return pathname.startsWith(href)
  }

  // Prefetch component for instant navigation
  const PrefetchLink = ({ href, label, Icon, badge, badgeColor }: any) => {
    const handlePrefetch = () => {
      // Basic prefetch logic - requests next.js page data
      if (typeof window !== 'undefined') {
        // We can custom trigger SWR revalidations or simply rely on Next.js Link prefetch (default)
        // Here we just ensure we don't block
      }
    }

    return (
      <Link 
        href={href} 
        className={`shop-nav-item ${isActive(href) ? 'active' : ''}`}
        onMouseEnter={handlePrefetch}
      >
        <Icon size={20} />
        {shopExpanded && (
          <>
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="badge" style={badgeColor ? { background: badgeColor } : undefined}>
                {badge}
              </span>
            )}
          </>
        )}
      </Link>
    )
  }

  // Navigation groups
  const shopItems = [
    { href: '/shop', label: 'ร้านค้า', Icon: GridIcon, badge: null },
    { href: '/shop/cart', label: 'ตะกร้า', Icon: CartIcon, badge: cartCount > 0 ? cartCount : null, badgeColor: undefined },
  ]
  
  const orderItems = [
    { href: '/shop/orders', label: 'รายการรอชำระ', Icon: ClockIcon, badge: pendingOrderCount > 0 ? pendingOrderCount : null, badgeColor: '#ef4444' },
    { href: '/shop/history', label: 'ประวัติการซื้อ', Icon: HistoryIcon, badge: null },
  ]
  
  const accountItems = [
    { href: '/shop/profile', label: 'โปรไฟล์', Icon: UserIcon, badge: null, badgeColor: undefined },
    { href: '/shop/stats', label: 'สถิติการเติมเงิน', Icon: WalletIcon, badge: null, badgeColor: undefined },
  ]

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`mobile-menu-overlay ${mobileOpen ? 'open' : ''}`}
        onClick={onCloseMobile}
      />

      {/* Sidebar */}
      <aside className={`shop-sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="shop-sidebar-logo">
          {/* <PackageIcon size={24} /> */}
          <span>Luminaris Shop</span>
        </div>

        {/* Navigation */}
        <nav className="shop-sidebar-nav">
          {/* Shop Section */}
          <div className="sidebar-section">
            <button 
              className="sidebar-section-header"
              onClick={() => setShopExpanded(!shopExpanded)}
            >
              <div className="sidebar-section-title">
                <CartIcon size={14} />
                <span>ซื้อสินค้า</span>
              </div>
              <ChevronIcon expanded={shopExpanded} />
            </button>
            {shopExpanded && (
              <div className="sidebar-section-content">
                {shopItems.map((item) => (
                  <PrefetchLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.Icon}
                    badge={item.badge}
                    badgeColor={item.badgeColor}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Orders Section */}
          <div className="sidebar-section">
            <button 
              className="sidebar-section-header"
              onClick={() => setOrdersExpanded(!ordersExpanded)}
            >
              <div className="sidebar-section-title">
                <PackageIcon size={14} />
                <span>รายการของฉัน</span>
              </div>
              <ChevronIcon expanded={ordersExpanded} />
            </button>
            {ordersExpanded && (
              <div className="sidebar-section-content">
                {orderItems.map((item) => (
                  <PrefetchLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.Icon}
                    badge={item.badge}
                    badgeColor={item.badgeColor}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Account Section */}
          <div className="sidebar-section">
            <button 
              className="sidebar-section-header"
              onClick={() => setAccountExpanded(!accountExpanded)}
            >
              <div className="sidebar-section-title">
                <UserIcon size={14} />
                <span>บัญชี</span>
              </div>
              <ChevronIcon expanded={accountExpanded} />
            </button>
            {accountExpanded && (
              <div className="sidebar-section-content">
                {accountItems.map((item) => (
                  <PrefetchLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.Icon}
                    badge={item.badge}
                    badgeColor={item.badgeColor}
                  />
                ))}
              </div>
            )}
          </div>
        </nav>

        <style jsx>{`
          .sidebar-section {
            margin-bottom: 0.25rem;
          }
          
          .sidebar-section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 0.625rem 0.75rem;
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--muted-foreground);
            background: transparent;
            border: none;
            cursor: pointer;
          }
          
          .sidebar-section-header:hover {
            color: var(--foreground);
            background: var(--muted);
            border-radius: 0.375rem;
          }
          
          .sidebar-section-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          
          .sidebar-section-content {
            display: flex;
            flex-direction: column;
            gap: 0.125rem;
            padding-left: 0.5rem;
          }
        `}</style>
      </aside>
    </>
  )
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [cartCount, setCartCount] = useState(0)
  const [pendingOrderCount, setPendingOrderCount] = useState(0)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [cartAnimating, setCartAnimating] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const lastFetchedRef = useRef<number>(0)
  const router = useRouter()

  const triggerCartAnimation = useCallback(() => {
    setCartAnimating(true)
    setTimeout(() => setCartAnimating(false), 600)
  }, [])

  const updateCartCount = useCallback(async () => {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      setCartCount(0)
      return
    }
    try {
      const userObj = JSON.parse(storedUser)
      // Fetch cart from API (DB is source of truth)
      const res = await apiFetch(`/api/cart?minecraftName=${userObj.minecraftName}`)
      const data = await res.json()
      const items = data.items || []
      const count = items.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 0), 0)
      setCartCount(count)
    } catch {
      setCartCount(0)
    }
  }, [])

  const fetchPendingOrders = useCallback(async (minecraftName: string) => {
    try {
      const res = await apiFetch(`/api/orders/user?minecraftName=${encodeURIComponent(minecraftName)}&status=pending`)
      const data = await res.json()
      if (data.orders) {
        setPendingOrderCount(data.orders.length)
      }
    } catch {
      setPendingOrderCount(0)
    }
  }, [])

  const lastHashRef = useRef<string>('')

  const initShopData = useCallback(async (force = false) => {
    // Cache logic: 5 mins cache or if already has data and not forced
    const now = Date.now()
    if (!force && products.length > 0 && categories.length > 0 && (now - lastFetchedRef.current < 5 * 60 * 1000)) {
      return
    }

    // Only show loading on first load, not on background refresh
    if (products.length === 0) {
      setIsLoadingData(true)
    }
    
    const storedUser = localStorage.getItem('user')
    let userQuery = ''
    
    if (storedUser) {
      try {
        const userObj = JSON.parse(storedUser)
        if (userObj.minecraftName) {
            userQuery = `?minecraftName=${userObj.minecraftName}`
        }
      } catch (e) {
        logger.error(`User parse error in layout: ${e}`)
      }
    }

    try {
      // Cache-busting: add timestamp when force refresh to bypass browser/CDN cache
      const cacheBuster = force ? `${userQuery ? '&' : '?'}_t=${Date.now()}` : ''
      
      const res = await apiFetch(`/api/shop/init${userQuery}${cacheBuster}`)
      
      // 304 Not Modified = data hasn't changed, no need to update UI
      if (res.status === 304) {
        lastFetchedRef.current = Date.now()
        return
      }
      
      const data = await res.json()
      
      // Store new hash for next request
      if (data.hash) {
        lastHashRef.current = data.hash
      }
      
      if (data.products) setProducts(data.products)
      if (data.categories) setCategories(data.categories)
      if (data.cart) {
        setCartCount(data.cart.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0))
      }
      if (data.pendingOrders !== undefined) {
        // pendingOrders can be a number (count) or array for backward compatibility
        const count = typeof data.pendingOrders === 'number' 
          ? data.pendingOrders 
          : (Array.isArray(data.pendingOrders) ? data.pendingOrders.length : 0)
        setPendingOrderCount(count)
      }
      
      lastFetchedRef.current = Date.now()
    } catch (error) {
      logger.error(`Shop Init Failed: ${error}`)
    } finally {
      setIsLoadingData(false)
    }
  }, [products.length, categories.length])

  const updatePendingCount = useCallback(() => {
    if (user) {
      fetchPendingOrders(user.minecraftName)
    } else {
      setPendingOrderCount(0)
    }
  }, [user, fetchPendingOrders])

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const userObj = JSON.parse(storedUser)
        setUser(userObj)
      } catch (e) {
        logger.error(`User parse error on boot: ${e}`)
      }
    }
    
    // Initial fetch
    initShopData()

    // 🔄 Auto Update System (Background Polling)
    // Fetch fresh data every 60 seconds
    const interval = setInterval(() => {
      initShopData(true) // force refresh in background
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [initShopData])

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
    setCartCount(0)
    setPendingOrderCount(0)
    router.push('/')
  }

  const handleLoginSuccess = (loggedInUser: { id: string; minecraftName: string }) => {
    setUser(loggedInUser)
    setShowLoginModal(false)
    fetchPendingOrders(loggedInUser.minecraftName)
  }

  return (
    <ShopContext.Provider value={{ 
      user, 
      setUser, 
      cartCount,
      setCartCount,
      updateCartCount,
      pendingOrderCount,
      updatePendingCount,
      showLoginModal, 
      setShowLoginModal,
      triggerCartAnimation,
      products,
      categories,
      isLoadingData,
      refreshData: initShopData
    }}>
      <div className="shop-layout">
        {/* Top Header with Profile Link */}
        <header className="shop-top-header">
          <div className="shop-top-header-left">
            <button 
              className="btn shop-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
            >
              <MenuIcon size={20} />
            </button>
            {/* Cart indicator on mobile - only shows when cart has items */}
            {cartCount > 0 && (
              <Link 
                href="/shop/cart" 
                className={`mobile-cart-btn ${cartAnimating ? 'cart-pop' : ''}`}
              >
                <CartIcon size={18} />
                <span>{cartCount}</span>
              </Link>
            )}
          </div>
          
          <div className="shop-top-header-right">
            {user ? (
              <div className="flex items-center gap-3">
                <Link href="/shop/profile" className="shop-header-profile">
                  <Image
                    src={`https://mc-heads.net/avatar/${getSkinName(user.minecraftName)}/24`}
                    alt="Head"
                    width={24}
                    height={24}
                    className="rounded"
                    unoptimized
                  />
                  <span>{user.minecraftName}</span>
                </Link>
                <button 
                  className="btn btn-sm"
                  onClick={() => setShowLogoutConfirm(true)}
                  title="ออกจากระบบ"
                >
                  <LogoutIcon size={16} />
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setShowLoginModal(true)}>
                <UserIcon size={14} />
                เข้าสู่ระบบ
              </button>
            )}
          </div>
        </header>

        <ShopSidebar
          cartCount={cartCount}
          pendingOrderCount={pendingOrderCount}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="shop-main">
          {children}
        </main>
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="ออกจากระบบ"
        content="ต้องการออกจากระบบใช่หรือไม่?"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        onConfirm={() => {
          setShowLogoutConfirm(false)
          handleLogout()
        }}
        onCancel={() => setShowLogoutConfirm(false)}
        isDestructive
      />
    </ShopContext.Provider>
  )
}
