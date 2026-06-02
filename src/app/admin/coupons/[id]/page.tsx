'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TagIcon, TrashIcon } from '@/components/Icons'
import { adminGet, adminPut, adminDelete } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import { SectionCard, FormField, AdminToggle, AdminDropdown } from '@/components/admin'
import CustomDateTimePicker from '@/components/CustomDateTimePicker'

const ShieldIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
  </svg>
)

const CalendarIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4"/><path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
  </svg>
)

interface EditCouponPageProps {
  params: Promise<{ id: string }>
}

export default function AdminEditCouponPage({ params }: EditCouponPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { success: toastSuccess, error: toastError } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const [formData, setFormData] = useState({
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    maxDiscount: '',
    minSpend: '0',
    maxUses: '',
    maxUsesPerUser: '1',
    isActive: true,
    startDate: '',
    endDate: '',
  })

  const formatDateTimeLocal = (isoString: string | null) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  useEffect(() => {
    async function loadCoupon() {
      try {
        setIsLoading(true)
        const res = await adminGet('/api/coupons')
        const data = await res.json()
        const found = Array.isArray(data) ? data.find((c: { id: string; [key: string]: unknown }) => c.id === id) : null
        if (!found) { toastError('ไม่พบข้อมูลคูปอง'); router.push('/admin/coupons'); return }
        setFormData({
          code: found.code || '',
          discountType: found.discountType || 'PERCENTAGE',
          discountValue: String(found.discountValue) || '',
          maxDiscount: found.maxDiscount ? String(found.maxDiscount) : '',
          minSpend: String(found.minSpend) || '0',
          maxUses: found.maxUses ? String(found.maxUses) : '',
          maxUsesPerUser: String(found.maxUsesPerUser) || '1',
          isActive: found.isActive ?? true,
          startDate: formatDateTimeLocal(found.startDate),
          endDate: formatDateTimeLocal(found.endDate),
        })
      } catch (err) {
        logger.error(`Failed to load coupon: ${err}`)
        toastError('ไม่สามารถโหลดข้อมูลคูปองได้')
        router.push('/admin/coupons')
      } finally {
        setIsLoading(false)
      }
    }
    loadCoupon()
  }, [id, router, toastError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(formData.discountValue)
    if (isNaN(value) || value <= 0) { toastError('มูลค่าส่วนลดต้องมากกว่า 0'); return }
    if (formData.discountType === 'PERCENTAGE' && value > 100) { toastError('ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%'); return }
    const minSpendVal = Number(formData.minSpend)
    if (isNaN(minSpendVal) || minSpendVal < 0) { toastError('ยอดขั้นต่ำต้องไม่ต่ำกว่า 0'); return }
    const maxUsesVal = formData.maxUses ? Number(formData.maxUses) : null
    if (maxUsesVal !== null && (isNaN(maxUsesVal) || maxUsesVal <= 0)) { toastError('จำกัดสิทธิ์รวมต้องมากกว่า 0'); return }
    const maxUsesPerUserVal = Number(formData.maxUsesPerUser)
    if (isNaN(maxUsesPerUserVal) || maxUsesPerUserVal <= 0) { toastError('จำกัดสิทธิ์ต่อคนต้องมากกว่า 0'); return }

    const payload = {
      code: formData.code.trim().toUpperCase(),
      discountType: formData.discountType,
      discountValue: value,
      maxDiscount: formData.discountType === 'PERCENTAGE' && formData.maxDiscount ? Number(formData.maxDiscount) : null,
      minSpend: minSpendVal,
      maxUses: maxUsesVal,
      maxUsesPerUser: maxUsesPerUserVal,
      isActive: formData.isActive,
      startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
      endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
    }

    try {
      const res = await adminPut(`/api/coupons/${id}`, payload)
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Failed') }
      toastSuccess('อัปเดตข้อมูลคูปองเรียบร้อยแล้ว')
      router.push('/admin/coupons')
    } catch (error) {
      const err = error as Error
      logger.error(`Error updating coupon: ${err.message}`)
      toastError(err.message || 'เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  const handleDelete = async () => {
    setShowConfirmDelete(false)
    try {
      const res = await adminDelete(`/api/coupons/${id}`)
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Failed') }
      toastSuccess('ลบคูปองเรียบร้อยแล้ว')
      router.push('/admin/coupons')
    } catch (error) {
      const err = error as Error
      logger.error(`Error deleting coupon: ${err.message}`)
      toastError(err.message || 'ไม่สามารถลบคูปองได้')
    }
  }

  const discountOptions = [
    { value: 'PERCENTAGE', label: 'เปอร์เซ็นต์ (%)' },
    { value: 'FIXED', label: 'ลดเป็นบาท (฿)' },
  ]

  if (isLoading) {
    return (
      <div className="admin-loading">
        <div className="spinner" style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="admin-form-page">
      <Link href="/admin/coupons" className="admin-form-back">← กลับหน้าคูปอง</Link>
      <h1 className="admin-form-page-title">แก้ไขคูปอง: {formData.code}</h1>

      <form onSubmit={handleSubmit}>
        <SectionCard title="ข้อมูลคูปอง" icon={<TagIcon size={15} />}>
          <FormField label="รหัสคูปอง" hint="รหัสคูปองไม่สามารถแก้ไขได้ หากต้องการเปลี่ยนรหัสโปรดสร้างใหม่">
            <input type="text" className="input"
              style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.875rem', opacity: 0.6, cursor: 'not-allowed' }}
              value={formData.code} disabled />
          </FormField>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <FormField label="ประเภทส่วนลด" required>
              <AdminDropdown value={formData.discountType} options={discountOptions}
                onChange={(val) => setFormData({ ...formData, discountType: val })} />
            </FormField>
            <FormField label={formData.discountType === 'PERCENTAGE' ? 'ส่วนลดกี่เปอร์เซ็นต์ (%)' : 'ลดราคากี่บาท (฿)'} required>
              <input type="number" className="input" style={{ fontWeight: 600 }}
                placeholder={formData.discountType === 'PERCENTAGE' ? 'เช่น 20' : 'เช่น 100'}
                value={formData.discountValue}
                onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                required min="1" max={formData.discountType === 'PERCENTAGE' ? '100' : undefined} />
            </FormField>
          </div>

          <div className="form-row" style={{ marginTop: '0.875rem' }}>
            <FormField label="ลดได้สูงสุด (บาท)" hint="เฉพาะแบบ % — ไม่ระบุ = ไม่จำกัด">
              <input type="number" className="input" placeholder="ไม่ระบุ = ไม่จำกัด"
                value={formData.maxDiscount}
                onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                disabled={formData.discountType !== 'PERCENTAGE'} min="1" />
            </FormField>
            <FormField label="ยอดซื้อขั้นต่ำ (บาท)" required>
              <input type="number" className="input" style={{ fontWeight: 600 }} placeholder="0 = ไม่มีขั้นต่ำ"
                value={formData.minSpend}
                onChange={(e) => setFormData({ ...formData, minSpend: e.target.value })} min="0" required />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="เงื่อนไขการจำกัดสิทธิ์" icon={<ShieldIcon size={15} />}>
          <div className="form-row">
            <FormField label="จำกัดสิทธิ์รวมทั้งหมด (ครั้ง)" hint="ไม่ระบุ = ไม่จำกัด">
              <input type="number" className="input" placeholder="ไม่ระบุ = ไม่จำกัด"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })} min="1" />
            </FormField>
            <FormField label="จำกัดต่อบัญชีผู้ใช้ (ครั้ง/คน)" required>
              <input type="number" className="input" style={{ fontWeight: 600 }}
                value={formData.maxUsesPerUser}
                onChange={(e) => setFormData({ ...formData, maxUsesPerUser: e.target.value })} min="1" required />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="ระยะเวลา & สถานะ" icon={<CalendarIcon size={15} />}>
          <AdminToggle title="เปิดใช้งานคูปองนี้" description="ปิด/เปิดการใช้งานคูปองนี้"
            checked={formData.isActive} onChange={(val) => setFormData({ ...formData, isActive: val })} />
          <hr className="section-divider" />
          <CustomDateTimePicker startDate={formData.startDate} endDate={formData.endDate}
            onChange={(start, end) => setFormData(prev => ({ ...prev, startDate: start, endDate: end }))} label="ช่วงเวลาการใช้งาน" />
        </SectionCard>

        <div className="admin-actions-bar">
          <div className="admin-actions-left">
            <button 
              type="button" 
              className="btn btn-danger" 
              onClick={() => setShowConfirmDelete(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <TrashIcon size={16} /> ลบคูปองถาวร
            </button>
          </div>
          <div className="admin-actions-right">
            <Link href="/admin/coupons" className="btn btn-outline">ยกเลิก</Link>
            <button type="submit" className="btn btn-primary btn-lg">บันทึกการแก้ไขคูปอง</button>
          </div>
        </div>
      </form>

      <ConfirmModal
        isOpen={showConfirmDelete}
        title="ยืนยันการลบคูปอง?"
        content={`คุณแน่ใจหรือไม่ว่าต้องการลบรหัสคูปอง "${formData.code}" ถาวร? ประวัติการใช้งาน (ถ้ามี) จะยังคงอยู่เพื่อความถูกต้องทางบัญชี`}
        confirmText="ลบข้อมูลถาวร"
        cancelText="ยกเลิก"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirmDelete(false)}
        isDestructive={true}
      />
    </div>
  )
}
