'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import {
  PlusIcon,
  SearchIcon,
  PackageIcon,
  EditIcon,
  CloseIcon,
  TrashIcon,
} from '@/components/Icons'
import dynamic from 'next/dynamic'
const ImageEditor = dynamic(() => import('@/components/ImageEditor'), {
  loading: () => <div className="p-4 text-center text-muted-foreground">Loading editor...</div>,
  ssr: false
})
import { adminDelete, adminPost, adminPut, adminGet } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'

import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
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
    products, 
    categories, 
    isLoading: loading, 
    refreshData: fetchProducts 
  } = useAdminData()
  
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0 as string | number,
    image: '',
    categoryId: '',
    commands: [''],
    requiresInput: false,
    inputLabel: '',
    inputPlaceholder: '',
  })

  // Confirm Modal
  const [showConfirm, setShowConfirm] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)

  useEffect(() => {
    // Lazy cleanup: Trigger cleanup of old orders when admin visits
    adminPost('/api/orders/cleanup', {}).catch(err => logger.error(`Cleanup warning: ${err}`))
  }, [])

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const { success, error: toastError } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        price: Number(formData.price),
        commands: formData.commands.filter((c) => c.trim() !== ''),
      }

      if (editingProduct) {
        await adminPut(`/api/products/${editingProduct.id}`, submitData)
        success('อัปเดตสินค้าเรียบร้อยแล้ว')
      } else {
        await adminPost('/api/products', submitData)
        success('เพิ่มสินค้าเรียบร้อยแล้ว')
      }

      setShowModal(false)
      setEditingProduct(null)
      resetForm()
      fetchProducts()
    } catch (error) {
      logger.error(`Error saving product: ${error}`)
      const err = error as Error
      toastError(err.message || 'เกิดข้อผิดพลาดในการบันทึกสินค้า')
    }
  }

  const handleEdit = async (product: Product) => {
    try {
      // Fetch full product data including commands
      const res = await adminGet(`/api/products/${product.id}`)
      const fullProduct = await res.json()
      
      setEditingProduct(product)
      setFormData({
        name: fullProduct.name,
        description: fullProduct.description || '',
        price: fullProduct.price,
        image: fullProduct.image || '',
        categoryId: fullProduct.categoryId,
        commands: fullProduct.commands?.length > 0 ? fullProduct.commands : [''],
        requiresInput: fullProduct.requiresInput || false,
        inputLabel: fullProduct.inputLabel || '',
        inputPlaceholder: fullProduct.inputPlaceholder || '',
      })
      setShowModal(true)
    } catch (error) {
      logger.error(`Error fetching product: ${error}`)
      // Fallback to basic data without commands
      setEditingProduct(product)
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price,
        image: product.image || '',
        categoryId: product.categoryId,
        commands: [''],
        requiresInput: product.requiresInput || false,
        inputLabel: product.inputLabel || '',
        inputPlaceholder: product.inputPlaceholder || '',
      })
      setShowModal(true)
    }
  }

  const confirmDelete = (id: string) => {
    setIdToDelete(id)
    setShowConfirm(true)
  }

  const executeDelete = async () => {
    if (!idToDelete) return
    const id = idToDelete
    setShowConfirm(false)
    setIdToDelete(null)

    if (editingProduct && editingProduct.id === id) {
        setShowModal(false)
        setEditingProduct(null)
    }

    try {
      await adminDelete(`/api/products/${id}`)
      success('ลบสินค้าเรียบร้อยแล้ว')
      fetchProducts()
    } catch (error) {
      logger.error(`Error deleting product: ${error}`)
      toastError('ไม่สามารถลบสินค้าได้')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: 0,
      image: '',
      categoryId: '',
      commands: [''],
      requiresInput: false,
      inputLabel: '',
      inputPlaceholder: '',
    })
  }

  const addCommand = () => {
    setFormData({ ...formData, commands: [...formData.commands, ''] })
  }

  const updateCommand = (index: number, value: string) => {
    const newCommands = [...formData.commands]
    newCommands[index] = value
    setFormData({ ...formData, commands: newCommands })
  }

  const removeCommand = (index: number) => {
    const newCommands = formData.commands.filter((_, i) => i !== index)
    setFormData({ ...formData, commands: newCommands })
  }

  return (
    <div>
      <div className="admin-header-actions">
        <h1 className="admin-title">รายการสินค้าทั้งหมด</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingProduct(null)
            resetForm()
            setShowModal(true)
          }}
        >
          <PlusIcon size={16} />
          เพิ่มสินค้า
        </button>
      </div>

      <div className="search-box-wrapper">
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
        <div className="empty-state">
          <PackageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>ไม่มีรายการสินค้าอื่น</p>
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <div key={product.id} className="product-card">
              <div className="product-image">
                {product.image ? (
                  <Image src={product.image} alt={product.name} fill style={{ objectFit: 'cover' }} />
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
                <button className="btn btn-outline btn-sm w-full" onClick={() => handleEdit(product)}>
                  <EditIcon size={16} />
                  แก้ไข
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowModal(false)}>
                <CloseIcon size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-section">
                <div className="form-group">
                    <label className="form-label">รูปภาพสินค้า</label>
                    <ImageEditor
                    initialImage={formData.image}
                    onImageChange={(url) => setFormData({ ...formData, image: url })}
                    />
                </div>
              </div>

              <div className="form-section">
                <div className="form-group">
                    <label className="form-label">ชื่อสินค้า <span className="text-red">*</span></label>
                    <input
                    type="text"
                    className="input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="เช่น ดาบเพชร"
                    />
                </div>

                <div className="grid-2">
                    <div className="form-group">
                    <label className="form-label">ราคา (บาท) <span className="text-red">*</span></label>
                    <input
                        type="number"
                        className="input"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        required
                        min="0"
                    />
                    </div>
                    <div className="form-group">
                    <label className="form-label">หมวดหมู่ <span className="text-red">*</span></label>
                    <select
                        className="input"
                        value={formData.categoryId}
                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                        required
                    >
                        <option value="">เลือกหมวดหมู่</option>
                        {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                        ))}
                    </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">รายละเอียด</label>
                    <textarea
                    className="input"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="รายละเอียดสินค้าที่จะแสดงหน้าร้านค้า"
                    />
                </div>
              </div>

              <div className="form-section">
                <div className="form-group">
                    <label className="form-label">
                        คำสั่ง RCON 
                        <span className="tooltip" title="คำสั่งที่จะรันบนเซิฟเวอร์เมื่อผู้เล่นซื้อสินค้า">?</span>
                    </label>
                    <div className="commands-list">
                        {formData.commands.map((cmd, index) => (
                        <div key={index} className="command-row">
                            <span className="command-prefix">/</span>
                            <input
                            type="text"
                            className="input command-input"
                            value={cmd}
                            onChange={(e) => updateCommand(index, e.target.value)}
                            placeholder="give {player} diamond 64"
                            />
                            {formData.commands.length > 1 && (
                            <button type="button" className="btn btn-icon btn-danger-outline" onClick={() => removeCommand(index)}>
                                <CloseIcon size={16} />
                            </button>
                            )}
                        </div>
                        ))}
                    </div>
                    <button type="button" className="btn btn-sm btn-secondary mt-2" onClick={addCommand}>
                        <PlusIcon size={14} /> เพิ่มคำสั่ง
                    </button>
                    <p className="form-hint">ใช้ <code>{'{player}'}</code> แทนชื่อผู้เล่น และ <code>{'{customInput}'}</code> แทนข้อมูลที่ผู้ใช้กรอก</p>
                </div>
              </div>

              {/* Custom Input Settings */}
              <div className="form-section">
                <div className="form-group">
                    <label className="form-label checkbox-label">
                        <input
                            type="checkbox"
                            checked={formData.requiresInput}
                            onChange={(e) => setFormData({ ...formData, requiresInput: e.target.checked })}
                            className="checkbox"
                        />
                        ต้องการข้อมูลจากผู้ใช้ (เช่น โค้ดสี)
                    </label>
                    <p className="form-hint">เปิดใช้สำหรับบริการที่ผู้ใช้ต้องกรอกข้อมูลเอง เช่น เปลี่ยนสีชื่อ</p>
                </div>

                {formData.requiresInput && (
                  <>
                    <div className="grid-2 mt-3">
                        <div className="form-group">
                            <label className="form-label">ชื่อ Field</label>
                            <input
                                type="text"
                                className="input"
                                value={formData.inputLabel}
                                onChange={(e) => setFormData({ ...formData, inputLabel: e.target.value })}
                                placeholder="เช่น โค้ดสี"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Placeholder</label>
                            <input
                                type="text"
                                className="input"
                                value={formData.inputPlaceholder}
                                onChange={(e) => setFormData({ ...formData, inputPlaceholder: e.target.value })}
                                placeholder="เช่น &a&lYourName"
                            />
                        </div>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <div className="footer-left">
                     {editingProduct && (
                    <button
                        type="button"
                        className="btn btn-danger-text"
                        onClick={() => confirmDelete(editingProduct.id)}
                    >
                        <TrashIcon size={16} /> ลบสินค้า
                    </button>
                    )}
                </div>
                <div className="footer-right">
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setShowModal(false)}
                    >
                        ยกเลิก
                    </button>
                    <button type="submit" className="btn btn-primary min-w-[120px]">
                        {editingProduct ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
                    </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirm}
        title="ยืนยันการลบ?"
        content="การกระทำนี้ไม่สามารถย้อนกลับได้ สินค้าจะถูกลบถาวร"
        confirmText="ลบข้อมูล"
        onConfirm={executeDelete}
        onCancel={() => {
            setShowConfirm(false)
            setIdToDelete(null)
        }}
        isDestructive={true}
       />
       
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
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            animation: fadeIn 0.2s ease-out;
        }

        /* Modal Content */
        .modal-content {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 1rem;
            width: 100%;
            max-width: 600px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
            background: transparent; border: none; color: #ef4444; padding: 0.5rem 0;
        }
        .btn-danger-text:hover {
            text-decoration: underline; background: transparent;
        }

        /* Product Card Updates */
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
