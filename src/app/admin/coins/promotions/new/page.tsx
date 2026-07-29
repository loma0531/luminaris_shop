'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GiftIcon } from '@/components/Icons'
import { adminPost } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import { SectionCard, FormField, AdminToggle, AdminDropdown } from '@/components/admin'
import CustomDateTimePicker from '@/components/CustomDateTimePicker'

const CalendarIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4"/><path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
  </svg>
)

export default function AdminNewPromotionPage() {
  const router = useRouter()
  const { success: toastSuccess, error: toastError } = useToast()

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

  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { toastError('กรุณากรอกชื่อโปรโมชั่น'); return }
    const val = parseFloat(formData.value)
    const min = parseFloat(formData.minSpend)
    if (isNaN(val) || val <= 0) {
      toastError('กรุณาระบุมูลค่าโปรโมชั่นที่มากกว่า 0')
      return
    }

    setLoading(true)
    const payload = {
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
      const res = await adminPost('/api/admin/coins/promotions', payload)
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Failed') }
      toastSuccess('สร้างโปรโมชั่นเรียบร้อยแล้ว')
      router.push('/admin/coins')
    } catch (error) {
      const err = error as Error
      logger.error(`Error creating promotion: ${err.message}`)
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างโปรโมชั่น')
    } finally {
      setLoading(false)
    }
  }

  const promoTypeOptions = [
    { value: 'MULTIPLIER', label: 'MULTIPLIER — คูณยอดเหรียญ' },
    { value: 'BONUS_CASH', label: 'BONUS_CASH — แถมเมื่อเติมครบยอด' },
  ]

  return (
    <div className="admin-form-page">
      <Link href="/admin/coins" className="admin-form-back">← กลับหน้าจัดการ Coin</Link>
      <h1 className="admin-form-page-title">สร้างโปรโมชั่นใหม่</h1>

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
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? 'กำลังบันทึก...' : 'สร้างโปรโมชั่นใหม่'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
