'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GiftIcon, TrashIcon } from '@/components/Icons'
import { adminGet, adminPut, adminDelete } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import { SectionCard, FormField, AdminToggle, AdminDropdown } from '@/components/admin'
import CustomDateTimePicker from '@/components/CustomDateTimePicker'

const CalendarIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4"/><path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
  </svg>
)

interface EditPromotionPageProps {
  params: Promise<{ id: string }>
}

export default function AdminEditPromotionPage({ params }: EditPromotionPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { success: toastSuccess, error: toastError } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    promoType: 'MULTIPLIER',
    value: '',
    minSpend: '0',
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
    async function loadPromotion() {
      try {
        setIsLoading(true)
        const res = await adminGet(`/api/admin/coins/promotions?id=${id}`)
        if (!res.ok) { throw new Error('Failed to load') }
        const data = await res.json()
        const found = data.promotion
        if (!found) { toastError('ไม่พบข้อมูลโปรโมชั่น'); router.push('/admin/coins'); return }
        setFormData({
          name: found.name || '',
          description: found.description || '',
          promoType: found.promoType || 'MULTIPLIER',
          value: String(found.value) || '',
          minSpend: String(found.minSpend) || '0',
          isActive: found.isActive ?? true,
          startDate: formatDateTimeLocal(found.startDate),
          endDate: formatDateTimeLocal(found.endDate),
        })
      } catch (err) {
        logger.error(`Failed to load promotion: ${err}`)
        toastError('ไม่สามารถโหลดข้อมูลโปรโมชั่นได้')
        router.push('/admin/coins')
      } finally {
        setIsLoading(false)
      }
    }
    loadPromotion()
  }, [id, router, toastError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { toastError('กรุณากรอกชื่อโปรโมชั่น'); return }
    const val = parseFloat(formData.value)
    const min = parseFloat(formData.minSpend)
    if (isNaN(val) || val <= 0) {
      toastError('กรุณาระบุมูลค่าโปรโมชั่นที่มากกว่า 0')
      return
    }

    setIsSaving(true)
    const payload = {
      id,
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      promoType: formData.promoType,
      value: val,
      minSpend: formData.promoType === 'BONUS_CASH' ? min : 0,
      isActive: formData.isActive,
      startDate: formData.startDate || null,
      endDate: formData.endDate || null,
    }

    try {
      const res = await adminPut('/api/admin/coins/promotions', payload)
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Failed') }
      toastSuccess('บันทึกการแก้ไขโปรโมชั่นเรียบร้อยแล้ว')
      router.push('/admin/coins')
    } catch (error) {
      const err = error as Error
      logger.error(`Error updating promotion: ${err.message}`)
      toastError(err.message || 'เกิดข้อผิดพลาดในการบันทึกโปรโมชั่น')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await adminDelete(`/api/admin/coins/promotions?id=${id}`)
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Failed') }
      toastSuccess('ลบโปรโมชั่นสำเร็จ')
      router.push('/admin/coins')
    } catch (error) {
      const err = error as Error
      logger.error(`Error deleting promotion: ${err.message}`)
      toastError(err.message || 'เกิดข้อผิดพลาดในการลบโปรโมชั่น')
    }
  }

  const promoTypeOptions = [
    { value: 'MULTIPLIER', label: 'MULTIPLIER — คูณยอดเหรียญ' },
    { value: 'BONUS_CASH', label: 'BONUS_CASH — แถมเมื่อเติมครบยอด' },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="admin-form-page">
      <Link href="/admin/coins" className="admin-form-back">← กลับหน้าจัดการ Coin</Link>
      
      <div className="flex items-center justify-between">
        <h1 className="admin-form-page-title">แก้ไขโปรโมชั่น</h1>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => setShowConfirmDelete(true)}
        >
          <TrashIcon size={13} /> ลบโปรโมชั่น
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Section 1: ข้อมูลโปรโมชั่น */}
        <SectionCard title="ข้อมูลโปรโมชั่น" icon={<GiftIcon size={15} />}>
          <FormField label="ชื่อโปรโมชั่น" required hint="ชื่อเรียกเพื่อจำแนกโปรโมชั่นและแสดงในหน้าเติมเงิน">
            <input
              type="text"
              className="input"
              placeholder="เช่น โปรโมชั่นสงกรานต์ คูณ 2"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </FormField>

          <FormField label="คำอธิบาย (ไม่บังคับ)" hint="รายละเอียดเพิ่มเติมแสดงใต้ชื่อโปรโมชั่น">
            <input
              type="text"
              className="input"
              placeholder="เช่น เติมเงินเพื่อรับ Coin สองเท่าวันนี้!"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </FormField>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <FormField label="ประเภทโปรโมชั่น" required>
              <AdminDropdown
                value={formData.promoType}
                options={promoTypeOptions}
                onChange={(val) => setFormData({ ...formData, promoType: val })}
              />
            </FormField>
            <FormField 
              label={formData.promoType === 'MULTIPLIER' ? 'ค่าตัวคูณ (เช่น 2 = คูณสอง)' : 'Coin ที่แถมเพิ่ม (Coin)'} 
              required
            >
              <input
                type="number"
                step="0.01"
                className="input"
                style={{ fontWeight: 600 }}
                placeholder={formData.promoType === 'MULTIPLIER' ? 'เช่น 2' : 'เช่น 50'}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                required
              />
            </FormField>
          </div>

          {formData.promoType === 'BONUS_CASH' && (
            <div className="form-row" style={{ marginTop: '0.875rem' }}>
              <FormField label="ยอดเติมเงินขั้นต่ำ (บาท)" required hint="ยอดเงินเติมขั้นต่ำที่จะได้รับโบนัสแถม Coin">
                <input
                  type="number"
                  className="input"
                  style={{ fontWeight: 600 }}
                  placeholder="เช่น 100"
                  value={formData.minSpend}
                  onChange={(e) => setFormData({ ...formData, minSpend: e.target.value })}
                  min="0"
                  required
                />
              </FormField>
              <div className="hidden md:block"></div>
            </div>
          )}
        </SectionCard>

        {/* Section 2: ระยะเวลา & สถานะ */}
        <SectionCard title="ระยะเวลา & สถานะ" icon={<CalendarIcon size={15} />}>
          <AdminToggle
            title="เปิดใช้งานโปรโมชั่นนี้ทันที"
            description="โปรโมชั่นจะมีผลตามช่วงเวลาที่กำหนดเมื่อเปิดใช้งาน"
            checked={formData.isActive}
            onChange={(val) => setFormData({ ...formData, isActive: val })}
          />

          <hr className="section-divider" />

          <CustomDateTimePicker
            startDate={formData.startDate}
            endDate={formData.endDate}
            onChange={(start, end) => setFormData(prev => ({ ...prev, startDate: start, endDate: end }))}
            label="ช่วงเวลาโปรโมชั่น (ไม่เลือก = มีผลทันทีและถาวร)"
          />
        </SectionCard>

        {/* Actions */}
        <div className="admin-actions-bar">
          <div className="admin-actions-right">
            <Link href="/admin/coins" className="btn btn-outline">ยกเลิก</Link>
            <button type="submit" className="btn btn-primary btn-lg" disabled={isSaving}>
              {isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขโปรโมชั่น'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmModal
        isOpen={showConfirmDelete}
        title="ยืนยันการลบโปรโมชั่น"
        content="คุณแน่ใจว่าต้องการลบโปรโมชั่นนี้? การกระทำนี้ไม่สามารถย้อนกลับได้"
        confirmText="ใช่, ลบเลย"
        cancelText="ยกเลิก"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />
    </div>
  )
}
