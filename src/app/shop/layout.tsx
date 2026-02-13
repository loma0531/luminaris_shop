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
import { useShopInit } from '@/lib/swr-hooks'
import type { Product, Category, CartItem } from '@/lib/swr-hooks'
import { logger } from '@/lib/logger'

// Re-export types for backward compatibility
export type { Product, Category, CartItem } from '@/lib/swr-hooks'

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
  refreshData: () => void
  // Blocking state
  isCartSaving: boolean
  startCartSave: () => void
  endCartSave: () => void
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

  // Prefetch component moved below to use SafeLink

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

  // Hook into context to check saving state
  const { isCartSaving } = useShop()

  // Wrapper for links to block navigation when saving
  const SafeLink = ({ href, children, className, ...props }: any) => {
    if (isCartSaving) {
      return (
        <div className={`${className} opacity-50 cursor-not-allowed`} title="กำลังบันทึกข้อมูล...">
          {children}
        </div>
      )
    }
    return <Link href={href} className={className} {...props}>{children}</Link>
  }
  
  // Custom PrefetchLink that uses SafeLink
  const PrefetchLink = ({ href, label, Icon, badge, badgeColor }: any) => {
    const handlePrefetch = () => {
      // Basic prefetch logic
      if (typeof window !== 'undefined' && !isCartSaving) {
        // ...
      }
    }

    return (
      <SafeLink 
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
      </SafeLink>
    )
  }

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
          <Image 
            src="/Legacy_of_Luminaris_World_Logo_NoBG_1-1_03.png" 
            alt="Luminaris" 
            width={28} 
            height={28}
            className="rounded"
          />
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
  const [cartCountOverride, setCartCountOverride] = useState<number | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [cartAnimating, setCartAnimating] = useState(false)
  const router = useRouter()

  // ─── SWR: ดึงข้อมูล shop ทั้งหมดด้วย useShopInit ───────────
  const minecraftName = user?.minecraftName || null
  const { data: shopData, isLoading: isLoadingData, mutate: mutateShopData } = useShopInit(minecraftName)

  // Derived data from SWR
  const products = shopData?.products || []
  const categories = shopData?.categories || []
  const swrCartCount = shopData?.cart?.reduce((sum, item) => sum + item.quantity, 0) || 0
  const pendingOrderCount = shopData?.pendingOrders || 0

  // cartCount: ใช้ override ถ้ามี (optimistic update) ไม่งั้นใช้จาก SWR
  const cartCount = cartCountOverride !== null ? cartCountOverride : swrCartCount

  // Reset override เมื่อ SWR data เปลี่ยน
  useEffect(() => {
    if (shopData) {
      setCartCountOverride(null)
    }
  }, [shopData])

  const triggerCartAnimation = useCallback(() => {
    setCartAnimating(true)
    setTimeout(() => setCartAnimating(false), 600)
  }, [])

  // setCartCount: optimistic update — ตั้ง override ทันที, SWR จะ sync ภายหลัง
  const setCartCount = useCallback((count: number) => {
    setCartCountOverride(count)
  }, [])

  // updateCartCount: trigger SWR revalidation
  const updateCartCount = useCallback(() => {
    mutateShopData()
  }, [mutateShopData])

  // updatePendingCount: trigger SWR revalidation 
  const updatePendingCount = useCallback(() => {
    mutateShopData()
  }, [mutateShopData])

  // refreshData: trigger SWR revalidation
  const refreshData = useCallback(() => {
    mutateShopData()
  }, [mutateShopData])

  // Load user from localStorage on mount
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
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
    setCartCountOverride(null)
    mutateShopData() // Clear SWR cache
    router.push('/')
  }

  const handleLoginSuccess = (loggedInUser: { id: string; minecraftName: string }) => {
    setUser(loggedInUser)
    setShowLoginModal(false)
    mutateShopData() // Refetch with new user
  }

  // Global saving state for cart operations
  const [isCartSaving, setIsCartSaving] = useState(false)
  
  // Expose methods to set saving state
  const startCartSave = useCallback(() => setIsCartSaving(true), [])
  const endCartSave = useCallback(() => setIsCartSaving(false), [])

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
      refreshData,
      isCartSaving,
      startCartSave,
      endCartSave,
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
