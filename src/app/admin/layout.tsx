'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode, createContext, useContext, useCallback, useEffect, useRef } from 'react'
import { AdminAuthProvider, useAdminAuth } from '@/context/AdminAuthContext'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'
import {
  CartIcon,
  FolderIcon,
  UsersIcon,
  PackageIcon,
  LogoutIcon,
  LockIcon,
  UserIcon,
  ArrowLeftIcon,
  MenuIcon,
  CloseIcon,
} from '@/components/Icons'
import ConfirmModal from '@/components/ConfirmModal'

// Terminal Icon for RCON
const TerminalIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

// Chart Icon for Sales
const ChartIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)

interface AdminLayoutProps {
  children: ReactNode
}

const navItems = [
  { href: '/admin', label: 'จัดการสินค้า', Icon: CartIcon },
  { href: '/admin/categories', label: 'จัดการหมวดหมู่', Icon: FolderIcon },
  { href: '/admin/users', label: 'จัดการผู้ใช้', Icon: UsersIcon },
  { href: '/admin/orders', label: 'ประวัติการซื้อ', Icon: PackageIcon },
  { href: '/admin/sales', label: 'สรุปยอดเติมเงิน', Icon: ChartIcon },
  { href: '/admin/rcon', label: 'RCON Console', Icon: TerminalIcon },
]

interface AdminDataContextType {
  stats: any
  recentOrders: any[]
  products: any[]
  categories: any[]
  isLoading: boolean
  refreshData: (force?: boolean) => Promise<void>
}

const AdminDataContext = createContext<AdminDataContextType | null>(null)

export function useAdminData() {
  const context = useContext(AdminDataContext)
  if (!context) throw new Error('useAdminData must be used within AdminLayout')
  return context
}

function AdminLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAdminAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const success = await login(email, password, token)
    
    if (!success) {
      setError('ข้อมูลเข้าสู่ระบบไม่ถูกต้อง')
    }
    
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            <LockIcon size={28} />
            ระบบจัดการหลังบ้าน
          </div>
          <p style={{ color: 'var(--muted-foreground)' }}>
            กรุณาใส่ข้อมูลเพื่อเข้าสู่ระบบ
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">อีเมล</label>
            <input
              type="email"
              className="input"
              placeholder="กรอกอีเมล"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">รหัสผ่าน</label>
            <input
              type="password"
              className="input"
              placeholder="กรอกรหัสผ่าน"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Token</label>
            <input
              type="password"
              className="input"
              placeholder="กรอก Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading || !email.trim() || !password.trim() || !token.trim()}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                กำลังตรวจสอบ...
              </>
            ) : (
              'เข้าสู่ระบบ'
            )}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <Link href="/" className="btn" style={{ fontSize: '0.875rem' }}>
            <ArrowLeftIcon size={16} />
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  )
}

function AdminContent({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const { isAuthenticated, loading, logout } = useAdminAuth()
  const { refreshData } = useAdminData()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      refreshData()
      
      // 🔄 Admin Auto Update (Poll every 60s)
      const interval = setInterval(() => {
        refreshData(true)
      }, 60 * 1000)
      
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, refreshData])

  const isActive = (href: string) => {
    if (!pathname) return false
    if (href === '/admin') {
      return pathname === '/admin' || pathname === '/admin/products'
    }
    return pathname.startsWith(href)
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AdminLoginForm />
  }

  return (
    <div className="admin-layout">
      {/* Mobile Overlay */}
      <div 
        className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      
      {/* Sidebar */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Mobile Close Button */}
        <button 
          className="admin-sidebar-close"
          onClick={() => setMobileMenuOpen(false)}
        >
          <CloseIcon size={18} />
        </button>
        
        <div className="admin-logo">
          <UserIcon size={20} />
          <span>ระบบจัดการ</span>
        </div>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${isActive(item.href) ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <item.Icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="admin-content">
        {/* Top Navbar - Matching Shop Style */}
        <header className="admin-top-header">
          <div className="admin-top-header-left">
            <button 
              className="btn admin-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
            >
              <MenuIcon size={20} />
            </button>
          </div>
          
          <div className="admin-top-header-right">
            <button 
              className="btn btn-sm" 
              onClick={() => setShowLogoutConfirm(true)}
            >
              <LogoutIcon size={16} />
              <span className="admin-logout-text">ออกจากระบบ</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="admin-page-content">
          {children}
        </div>
      </main>

      <style jsx>{`
        .admin-top-header {
          position: fixed;
          top: 0;
          left: 250px;
          right: 0;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          background: var(--background);
          border-bottom: 1px solid var(--border);
          z-index: 30;
        }
        
        .admin-top-header-left {
          display: flex;
          align-items: center;
        }
        
        .admin-top-header-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .admin-menu-btn {
          display: none;
        }
        
        .admin-page-content {
          padding: 1.5rem;
          margin-top: 56px;
        }
        
        .admin-sidebar-close {
          display: none;
          position: absolute;
          top: 1rem;
          right: 1rem;
          padding: 0.5rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 0.375rem;
          color: var(--foreground);
          cursor: pointer;
        }
        
        @media (max-width: 768px) {
          .admin-top-header {
            left: 0;
          }
          
          .admin-menu-btn {
            display: flex;
          }
          
          .admin-sidebar-close {
            display: flex;
          }
          
          .admin-logout-text {
            display: none;
          }
          
          .admin-page-content {
            padding: 1rem;
          }
        }
      `}</style>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="ออกจากระบบ"
        content="ต้องการออกจากระบบใช่หรือไม่?"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        onConfirm={() => {
          setShowLogoutConfirm(false)
          logout()
        }}
        onCancel={() => setShowLogoutConfirm(false)}
        isDestructive
      />
    </div>
  )
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [stats, setStats] = useState<any>(null)
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const lastFetchedRef = useRef<number>(0)

  const refreshData = useCallback(async (force = false) => {
    // Cache: 1 minute for admin (more frequent)
    const now = Date.now()
    if (!force && stats && (now - lastFetchedRef.current < 60 * 1000)) {
      return
    }

    setIsLoading(true)
    try {
      // Fetch core admin data in parallel
      const [statsRes, ordersRes, productsRes, categoriesRes] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/orders/latest'),
        apiFetch('/api/products'),
        apiFetch('/api/categories')
      ])

      const [statsData, ordersData, prodData, catData] = await Promise.all([
        statsRes.json(),
        ordersRes.json(),
        productsRes.json(),
        categoriesRes.json()
      ])

      setStats(statsData)
      setRecentOrders(ordersData.orders || [])
      setProducts(prodData)
      setCategories(catData)
      lastFetchedRef.current = Date.now()
    } catch (error) {
      logger.error(`Admin Data Fetch Failed: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }, [stats])

  useEffect(() => {
    // We only poll if authenticated
    // This will be handled inside AdminContent but we can also put basic interval here
    // But since AdminContent handles auth check, it's safer there or triggered by auth state
  }, [])

  return (
    <AdminAuthProvider>
      <AdminDataContext.Provider value={{
        stats,
        recentOrders,
        products,
        categories,
        isLoading,
        refreshData
      }}>
        <AdminContent>{children}</AdminContent>
      </AdminDataContext.Provider>
    </AdminAuthProvider>
  )
}
