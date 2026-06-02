'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  PlusIcon,
  SearchIcon,
  PackageIcon,
  EditIcon,
} from '@/components/Icons'
import { adminPost, adminPut } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'

import { useToast } from '@/context/ToastContext'
import { useAdminData } from './layout'

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  image: string | null
  categoryId: string
  soldCount: number
  isActive: boolean
  requiresInput?: boolean
  inputLabel?: string | null
  inputPlaceholder?: string | null
  category: {
    name: string
  }
}

export default function AdminProductsPage() {
  const { 
    products: rawProducts, 
    isLoading: loading, 
    refreshData: fetchProducts 
  } = useAdminData()
  
  const products = rawProducts as unknown as Product[]
  
  const [search, setSearch] = useState('')

  useEffect(() => {
    // Lazy cleanup: Trigger cleanup of old orders when admin visits
    adminPost('/api/orders/cleanup', {}).catch(err => logger.error(`Cleanup warning: ${err}`))
  }, [])

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const { success, error: toastError } = useToast()

  const handleToggleActive = async (product: Product) => {
    try {
      await adminPut(`/api/products/${product.id}`, {
        isActive: !product.isActive
      })
      success(product.isActive ? `ปิดการขาย "${product.name}" แล้ว` : `เปิดการขาย "${product.name}" แล้ว`)
      fetchProducts(true) // Force refresh
    } catch (error) {
      logger.error(`Error toggling product active: ${error}`)
      toastError('ไม่สามารถเปลี่ยนสถานะสินค้าได้')
    }
  }

  return (
    <div>
      <div className="admin-header-actions animate-fade-in-down">
        <h1 className="admin-title">รายการสินค้าทั้งหมด</h1>
      <Link href="/admin/products/new" className="btn btn-primary">
          <PlusIcon size={16} />
          เพิ่มสินค้า
      </Link>
      </div>

      <div className="search-box-wrapper animate-fade-in-left delay-100">
        <div className="search-box">
          <span className="search-icon"><SearchIcon size={16} /></span>
          <input
            type="text"
            className="input"
            placeholder="ค้นหาสินค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state animate-scale-in">
          <PackageIcon size={48} className="mb-4 opacity-50" />
          <p>ไม่มีรายการสินค้าอื่น</p>
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product, index) => {
            const delayClass = 
              index === 0 ? 'delay-50' : 
              index === 1 ? 'delay-100' : 
              index === 2 ? 'delay-150' : 
              index === 3 ? 'delay-200' : 
              index === 4 ? 'delay-250' : 'delay-300'
            
            return (
              <div key={product.id} className={`product-card animate-scale-in ${delayClass} ${product.isActive ? '' : 'inactive'}`}>
                <div className="product-image">
                  {product.image ? (
                    <Image src={product.image} alt={product.name} fill className="object-cover" />
                  ) : (
                    <PackageIcon size={40} />
                  )}
                </div>
                <div className="product-info">
                  <div className="product-header">
                      <h3 className="product-name">{product.name}</h3>
                      <span className="product-price-badge">฿{product.price}</span>
                  </div>
                  <p className="product-meta">
                    ขายแล้ว {product.soldCount} ชิ้น • {product.category?.name || 'ไม่มีหมวดหมู่'}
                  </p>
                </div>
                <div className="product-actions">
                  <Link href={`/admin/products/${product.id}`} className="btn btn-outline btn-sm" style={{ flex: '1' }}>
                    <EditIcon size={16} />
                    แก้ไข
                  </Link>
                  <div className="switch-container">
                    <span className="switch-label">{product.isActive ? 'เปิดขาย' : 'ปิดขาย'}</span>
                    <button 
                      type="button"
                      className={`switch-toggle ${product.isActive ? 'active' : ''}`}
                      onClick={() => handleToggleActive(product)}
                      aria-label={product.isActive ? 'ปิดการขาย' : 'เปิดการขาย'}
                    >
                      <span className="switch-handle" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
       
       <style jsx>{`
        .admin-header-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2rem;
        }
        .search-box-wrapper { margin-bottom: 2rem; max-width: 400px; }
        .w-full { width: 100%; }
        .text-red { color: #ef4444; margin-left: 2px; }
        .mt-2 { margin-top: 0.5rem; }
        
        /* Modal Backdrop */
        .modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8); /* ทึบขึ้น 80% (เพิ่ม 10%) */
            backdrop-filter: blur(8px);      /* เบลอมากขึ้นเป็น 8px */
            -webkit-backdrop-filter: blur(8px);
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            animation: fadeIn 0.2s ease-out;
        }

        /* Modal Content */
        .modal-content {
            background: linear-gradient(135deg, rgba(30, 30, 50, 0.96) 0%, rgba(20, 20, 35, 0.96) 100%); /* ทึบ 96% โทนชาร์โคลน้ำเงินเข้ม */
            border: 1px solid rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(20px);      /* เบลอเนื้อหากล่อง 20px */
            -webkit-backdrop-filter: blur(20px);
            border-radius: 1rem;
            width: 100%;
            max-width: 600px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        :global(html[data-theme="light"]) .modal-content {
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 245, 250, 0.96) 100%);
            border: 1px solid rgba(9, 9, 11, 0.08);
        }

        .modal-header {
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .modal-form {
            padding: 1.5rem;
            overflow-y: auto;
            flex: 1;
        }

        .form-section {
            margin-bottom: 1.5rem;
            padding-bottom: 1.5rem;
            border-bottom: 1px solid var(--border);
        }
        .form-section:last-child {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 0;
        }

        .modal-footer {
            padding: 1.25rem 1.5rem;
            border-top: 1px solid var(--border);
            background: var(--muted); 
            border-bottom-left-radius: 1rem;
            border-bottom-right-radius: 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .footer-right {
            display: flex;
            gap: 0.75rem;
        }

        /* Custom Inputs */
        .commands-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        .command-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .command-prefix {
            font-family: monospace;
            color: var(--muted-foreground);
            font-weight: bold;
        }
        .command-input {
            font-family: monospace;
        }
        .form-hint {
            font-size: 0.75rem;
            color: var(--muted-foreground);
            margin-top: 0.5rem;
        }
        code {
            background: rgba(255,255,255,0.1);
            padding: 0.1rem 0.3rem;
            border-radius: 0.2rem;
            font-family: monospace;
        }

        /* Checkbox */
        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            font-weight: normal;
        }
        .checkbox {
            width: 1.1rem;
            height: 1.1rem;
            accent-color: var(--primary);
            cursor: pointer;
        }
        .mt-3 { margin-top: 0.75rem; }
        .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
        }

        /* Buttons */
        .btn-ghost { background: transparent; border: none; }
        .btn-ghost:hover { background: var(--muted); }
        
        .btn-danger-outline {
            color: #ef4444; border-color: rgba(239,68,68,0.3); background: transparent;
        }
        .btn-danger-outline:hover {
            background: rgba(239,68,68,0.1); border-color: #ef4444;
        }
        
        .btn-danger-text {
            background: transparent !important; 
            border: none !important; 
            color: #ef4444; 
            padding: 0.5rem 0 !important;
            min-width: auto !important; 
            min-height: auto !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }
        .btn-danger-text:hover {
            text-decoration: underline; 
            background: transparent !important;
            transform: none !important;
            box-shadow: none !important;
        }

        /* Premium Switch */
        .switch-container {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(255, 255, 255, 0.04);
            padding: 0.25rem 0.5rem 0.25rem 0.75rem;
            border-radius: 8px;
            border: 1px solid var(--border);
            user-select: none;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }
        :global(html[data-theme="light"]) .switch-container {
            background: rgba(0, 0, 0, 0.03);
        }
        .switch-label {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--muted-foreground);
            min-width: 42px;
        }
        .switch-toggle {
            position: relative;
            width: 40px;
            height: 22px;
            border-radius: 100px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--border);
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            align-items: center;
            padding: 0;
            outline: none;
        }
        :global(html[data-theme="light"]) .switch-toggle {
            background: rgba(0, 0, 0, 0.08);
        }
        .switch-toggle.active {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-color: rgba(16, 185, 129, 0.3);
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
        }
        .switch-handle {
            position: absolute;
            left: 2px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .switch-toggle.active .switch-handle {
            left: calc(100% - 18px);
        }

        /* Product Card Updates */
        .product-card.inactive {
            opacity: 0.55;
            filter: grayscale(35%);
            border-color: rgba(255, 255, 255, 0.05);
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.1) 100%);
        }
        
        .product-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.5rem;
        }
        .product-price-badge {
            background: var(--primary);
            color: var(--primary-foreground);
            font-weight: bold;
            padding: 0.2rem 0.5rem;
            border-radius: 0.3rem;
            font-size: 0.8rem;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
       `}</style>
    </div>
  )
}
