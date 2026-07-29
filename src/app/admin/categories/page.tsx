'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PlusIcon,
  SearchIcon,
  FolderIcon,
  EditIcon,
  CloseIcon,
  TrashIcon,
} from '@/components/Icons'
import { adminDelete, adminPost, adminPut, adminGet } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'

import { useToast } from '@/context/ToastContext'
import { SkeletonAdminTable } from '@/components/Skeleton'
import ConfirmModal from '@/components/ConfirmModal'

interface Category {
  id: string
  name: string
  description: string | null
  _count?: {
    products: number
  }
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })
  
  // Confirm Modal
  const [showConfirm, setShowConfirm] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)

  const fetchCategories = useCallback(async (bustCache = false) => {
    try {
      // Add cache busting when needed (after mutations)
      const url = bustCache ? `/api/categories?_t=${Date.now()}` : '/api/categories'
      const res = await adminGet(url)
      const data = await res.json()
      setCategories(data)
    } catch (error) {
      logger.error(`Error fetching categories: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const { success, error: toastError } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingCategory) {
        await adminPut(`/api/categories/${editingCategory.id}`, formData)
        success('อัปเดตหมวดหมู่เรียบร้อยแล้ว')
      } else {
        await adminPost('/api/categories', formData)
        success('เพิ่มหมวดหมู่เรียบร้อยแล้ว')
      }

      setShowModal(false)
      setEditingCategory(null)
      resetForm()
      fetchCategories(true) // Bust cache after mutation
    } catch (error) {
      logger.error(`Error saving category: ${error}`)
      toastError('เกิดข้อผิดพลาดในการบันทึกหมวดหมู่')
    }
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      description: category.description || '',
    })
    setShowModal(true)
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
    
    if (editingCategory && editingCategory.id === id) {
        setShowModal(false)
        setEditingCategory(null)
    }

    try {
      await adminDelete(`/api/categories/${id}`)
      success('ลบหมวดหมู่เรียบร้อยแล้ว')
      fetchCategories(true) // Bust cache after mutation
    } catch (error) {
      logger.error(`Error deleting category: ${error}`)
      toastError('ไม่สามารถลบหมวดหมู่ได้')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="admin-title">รายการหมวดหมู่สินค้าทั้งหมด</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingCategory(null)
            resetForm()
            setShowModal(true)
          }}
        >
          <PlusIcon size={16} />
          เพิ่มหมวดหมู่
        </button>
      </div>

      <div className="search-box mb-6">
        <span className="search-icon"><SearchIcon size={16} /></span>
        <input
          type="text"
          className="input"
          placeholder="ค้นหาหมวดหมู่สินค้า"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <SkeletonAdminTable cols={[25, 45, 15, 15]} />
      ) : filteredCategories.length === 0 ? (
        <div className="empty-state">
          <FolderIcon size={48} className="mb-4 opacity-50" />
          <p>ไม่มีหมวดหมู่สินค้า</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อหมวดหมู่</th>
                <th>รายละเอียด</th>
                <th>จำนวนสินค้า</th>
                <th className="w-[100px]">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((category) => (
                <tr key={category.id}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <FolderIcon size={18} />
                      {category.name}
                    </div>
                  </td>
                  <td className="text-muted-foreground">
                    {category.description || '-'}
                  </td>
                  <td>
                    <span className="badge">{category._count?.products || 0} รายการ</span>
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => handleEdit(category)}>
                      <EditIcon size={14} />
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingCategory ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}
              </h2>
              <button 
                className="btn btn-icon" 
                onClick={() => setShowModal(false)}
                aria-label="ปิดหน้าต่างแก้ไขหมวดหมู่"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">ชื่อหมวดหมู่</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">รายละเอียด</label>
                <textarea
                  className="input"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex gap-3 justify-end mt-4">
                {editingCategory && (
                  <button
                    type="button"
                    className="btn btn-danger mr-auto"
                    onClick={() => confirmDelete(editingCategory.id)}
                  >
                    <TrashIcon size={16} />
                    ลบหมวดหมู่
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowModal(false)
                    setEditingCategory(null)
                    resetForm()
                  }}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCategory ? 'บันทึก' : 'เพิ่มหมวดหมู่'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirm}
        title="ยืนยันการลบ?"
        content="การกระทำนี้ไม่สามารถย้อนกลับได้ หมวดหมู่จะถูกลบถาวร"
        confirmText="ลบข้อมูล"
        onConfirm={executeDelete}
        onCancel={() => {
            setShowConfirm(false)
            setIdToDelete(null)
        }}
        isDestructive={true}
       />
    </div>
  )
}
