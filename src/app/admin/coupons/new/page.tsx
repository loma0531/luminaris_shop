'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TagIcon } from '@/components/Icons'
import { adminPost } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import { shopConfig } from '@/lib/config'
import { SectionCard, FormField, AdminToggle, AdminDropdown } from '@/components/admin'
import CustomDateTimePicker from '@/components/CustomDateTimePicker'

const SparkIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
)

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

export default function AdminNewCouponPage() {
  const router = useRouter()
  const { success: toastSuccess, error: toastError } = useToast()

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

  const handleGenerateRandomCode = () => {
    const config = shopConfig.coupons || { randomPrefix: 'LLW-', randomLength: 5, randomChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' }
    const prefix = config.randomPrefix || 'LLW-'
    const length = config.randomLength || 5
    const chars = config.randomChars || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let randomPart = ''
    for (let i = 0; i < length; i++) {
      randomPart += chars[Math.floor(Math.random() * chars.length)]
    }
    setFormData(prev => ({ ...prev, code: `${prefix}${randomPart}`.toUpperCase() }))
    toastSuccess('สุ่มรหัสคูปองสำเร็จ')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.code.trim()) { toastError('กรุณากรอกรหัสคูปอง'); return }
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
      const res = await adminPost('/api/coupons', payload)
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Failed') }
      toastSuccess('เพิ่มคูปองเรียบร้อยแล้ว')
      router.push('/admin/coupons')
    } catch (error) {
      const err = error as Error
      logger.error(`Error creating coupon: ${err.message}`)
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างคูปอง')
    }
  }

  const discountOptions = [
    { value: 'PERCENTAGE', label: 'เปอร์เซ็นต์ (%)' },
    { value: 'FIXED', label: 'ลดเป็นบาท (฿)' },
  ]

  return (
    <div className="admin-form-page">
      <Link href="/admin/coupons" className="admin-form-back">← กลับหน้าคูปอง</Link>
      <h1 className="admin-form-page-title">สร้างคูปองส่วนลดใหม่</h1>

      <form onSubmit={handleSubmit}>
        {/* Section 1: ข้อมูลคูปอง */}
        <SectionCard title="ข้อมูลคูปอง" icon={<TagIcon size={15} />}>
          <FormField label="รหัสคูปอง (ตัวพิมพ์ใหญ่)" required hint="รหัสสำหรับผู้เล่นกรอกตอนเช็คเอาท์ ตั้งคำนำหน้าได้ใน shop.config.ts">
            <div className="input-with-action">
              <input
                type="text"
                className="input"
                style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.875rem' }}
                placeholder="เช่น LLW-WELCOME"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                required
              />
              <button type="button" className="btn-generate" onClick={handleGenerateRandomCode}>
                <SparkIcon size={13} /> สุ่มรหัส
              </button>
            </div>
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
              <input type="number" className="input"
                placeholder="ไม่ระบุ = ไม่จำกัด"
                value={formData.maxDiscount}
                onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                disabled={formData.discountType !== 'PERCENTAGE'} min="1" />
            </FormField>
            <FormField label="ยอดซื้อขั้นต่ำ (บาท)" required>
              <input type="number" className="input" style={{ fontWeight: 600 }}
                placeholder="0 = ไม่มีขั้นต่ำ"
                value={formData.minSpend}
                onChange={(e) => setFormData({ ...formData, minSpend: e.target.value })}
                min="0" required />
            </FormField>
          </div>
        </SectionCard>

        {/* Section 2: เงื่อนไขจำกัดสิทธิ์ */}
        <SectionCard title="เงื่อนไขการจำกัดสิทธิ์" icon={<ShieldIcon size={15} />}>
          <div className="form-row">
            <FormField label="จำกัดสิทธิ์รวมทั้งหมด (ครั้ง)" hint="ไม่ระบุ = ไม่จำกัด">
              <input type="number" className="input"
                placeholder="ไม่ระบุ = ไม่จำกัด"
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

        {/* Section 3: ระยะเวลา & สถานะ */}
        <SectionCard title="ระยะเวลา & สถานะ" icon={<CalendarIcon size={15} />}>
          <AdminToggle title="เปิดใช้งานคูปองนี้ทันที" description="คูปองจะพร้อมใช้หลังบันทึก"
            checked={formData.isActive} onChange={(val) => setFormData({ ...formData, isActive: val })} />

          <hr className="section-divider" />

          <CustomDateTimePicker
            startDate={formData.startDate}
            endDate={formData.endDate}
            onChange={(start, end) => setFormData(prev => ({ ...prev, startDate: start, endDate: end }))}
            label="ช่วงเวลาการใช้งาน"
          />
        </SectionCard>

        {/* Actions */}
        <div className="admin-actions-bar">
          <button type="submit" className="btn btn-primary btn-lg">สร้างคูปองส่วนลดใหม่</button>
          <Link href="/admin/coupons" className="btn btn-outline">ยกเลิก</Link>
        </div>
      </form>
    </div>
  )
}
