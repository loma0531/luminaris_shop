'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PlusIcon, CloseIcon } from '@/components/Icons'
import dynamic from 'next/dynamic'

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), {
  loading: () => <div className="p-4 text-center text-muted-foreground">Loading editor...</div>,
  ssr: false
})

import { adminPost } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import { useAdminData } from '../../layout'
import { SectionCard, FormField, AdminToggle, AdminDropdown } from '@/components/admin'
import CustomDateTimePicker from '@/components/CustomDateTimePicker'

// SVG Icons inline
const BoxIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/>
    <path d="M12 22V12"/>
  </svg>
)

const TerminalIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"/>
    <line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
)

const TagSaleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L12 24"/>
    <path d="M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h5.172a2 2 0 0 1 1.414.586L18 11"/>
    <circle cx="6.5" cy="6.5" r=".5" fill="currentColor"/>
  </svg>
)

export default function AdminNewProductPage() {
  const { categories, refreshData: fetchProducts } = useAdminData()
  const router = useRouter()
  const { success, error: toastError } = useToast()

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
    isActive: true,
    saleActive: false,
    discountType: 'PERCENTAGE',
    discountValue: 0 as string | number,
    saleStart: '',
    saleEnd: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        price: Number(formData.price),
        commands: formData.commands.filter((c) => c.trim() !== ''),
        discountValue: formData.saleActive ? Number(formData.discountValue) : null,
        discountType: formData.saleActive ? formData.discountType : null,
        saleStart: formData.saleActive && formData.saleStart ? new Date(formData.saleStart).toISOString() : null,
        saleEnd: formData.saleActive && formData.saleEnd ? new Date(formData.saleEnd).toISOString() : null,
      }

      await adminPost('/api/products', submitData)
      success('เพิ่มสินค้าใหม่เรียบร้อยแล้ว')
      fetchProducts(true)
      router.push('/admin')
    } catch (error) {
      logger.error(`Error creating product: ${error}`)
      const err = error as Error
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างสินค้า')
    }
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

  const categoryOptions = [
    { value: '', label: 'เลือกหมวดหมู่' },
    ...categories.map(c => ({ value: c.id, label: c.name }))
  ]

  const discountOptions = [
    { value: 'PERCENTAGE', label: 'เปอร์เซ็นต์ (%)' },
    { value: 'FIXED', label: 'ลดเป็นบาท (฿)' },
  ]

  return (
    <div className="admin-form-page">
      <Link href="/admin" className="admin-form-back">
        ← กลับหน้าหลัก
      </Link>
      <h1 className="admin-form-page-title">เพิ่มสินค้าใหม่</h1>

      <form onSubmit={handleSubmit}>
        {/* Section 1: ข้อมูลพื้นฐาน */}
        <SectionCard title="ข้อมูลพื้นฐาน" icon={<BoxIcon size={15} />}>
          <FormField label="รูปภาพสินค้า">
            <ImageEditor
              initialImage={formData.image}
              onImageChange={(url) => setFormData({ ...formData, image: url })}
            />
          </FormField>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <FormField label="ชื่อสินค้า" required>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="เช่น ดาบเนเธอไรต์สุดเท่"
              />
            </FormField>
            <FormField label="หมวดหมู่" required>
              <AdminDropdown
                value={formData.categoryId}
                options={categoryOptions}
                onChange={(val) => setFormData({ ...formData, categoryId: val })}
                placeholder="เลือกหมวดหมู่"
              />
            </FormField>
          </div>

          <div className="form-row" style={{ marginTop: '0.875rem' }}>
            <FormField label="ราคา (บาท)" required>
              <input
                type="number"
                className="input"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
                min="0"
                step="any"
              />
            </FormField>
            <FormField label="คำอธิบาย">
              <textarea
                className="input"
                rows={1}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="อธิบายสินค้าสั้นๆ..."
                style={{ resize: 'vertical', minHeight: '42px' }}
              />
            </FormField>
          </div>

          <hr className="section-divider" />

          <AdminToggle
            title="เปิดขายสินค้านี้ทันที"
            description="สินค้าจะแสดงในหน้าร้านค้าหลังบันทึก"
            checked={formData.isActive}
            onChange={(val) => setFormData({ ...formData, isActive: val })}
          />
        </SectionCard>

        {/* Section 2: คำสั่ง RCON */}
        <SectionCard title="คำสั่ง RCON" icon={<TerminalIcon size={15} />}>
          <FormField
            label="รายการคำสั่ง"
            hint={
              <>
                ใช้ <span className="code-inline">{'{player}'}</span> สำหรับดึงชื่อผู้ใช้ และ <span className="code-inline">{'{customInput}'}</span> สำหรับข้อมูลที่ผู้เล่นกรอก
              </>
            }
          >
            <div className="cmd-list">
              {formData.commands.map((cmd, index) => (
                <div key={index} className="cmd-row">
                  <span className="cmd-prefix">/</span>
                  <input
                    type="text"
                    className="input cmd-input"
                    value={cmd}
                    onChange={(e) => updateCommand(index, e.target.value)}
                    placeholder="give {player} diamond 64"
                  />
                  {formData.commands.length > 1 && (
                    <button type="button" className="btn-remove" onClick={() => removeCommand(index)}>
                      <CloseIcon size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </FormField>
          <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: '0.5rem' }} onClick={addCommand}>
            <PlusIcon size={14} /> เพิ่มคำสั่ง
          </button>

          <hr className="section-divider" />

          <AdminToggle
            title="ต้องการข้อมูลเพิ่มจากผู้เล่น"
            description="เปิดใช้เมื่อต้องให้ผู้เล่นกรอกข้อมูลก่อนซื้อ เช่น ฉายา หรือสีชื่อ"
            checked={formData.requiresInput}
            onChange={(val) => setFormData({ ...formData, requiresInput: val })}
          />

          {formData.requiresInput && (
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <FormField label="หัวข้อ (Label)">
                <input
                  type="text"
                  className="input"
                  value={formData.inputLabel}
                  onChange={(e) => setFormData({ ...formData, inputLabel: e.target.value })}
                  placeholder="เช่น สีที่ต้องการ"
                />
              </FormField>
              <FormField label="คำใบ้ (Placeholder)">
                <input
                  type="text"
                  className="input"
                  value={formData.inputPlaceholder}
                  onChange={(e) => setFormData({ ...formData, inputPlaceholder: e.target.value })}
                  placeholder="เช่น &bYourName"
                />
              </FormField>
            </div>
          )}
        </SectionCard>

        {/* Section 3: โปรโมชัน */}
        <SectionCard title="ราคาพิเศษ & โปรโมชัน" icon={<TagSaleIcon size={15} />}>
          <AdminToggle
            title="เปิดใช้ราคาพิเศษ"
            description="ตั้งค่าส่วนลดสำหรับสินค้าชิ้นนี้"
            checked={formData.saleActive}
            onChange={(val) => setFormData({ ...formData, saleActive: val })}
          />

          {formData.saleActive && (
            <>
              <div className="form-row" style={{ marginTop: '0.75rem' }}>
                <FormField label="ประเภทส่วนลด" required>
                  <AdminDropdown
                    value={formData.discountType}
                    options={discountOptions}
                    onChange={(val) => setFormData({ ...formData, discountType: val })}
                  />
                </FormField>
                <FormField label={formData.discountType === 'PERCENTAGE' ? 'ลดกี่เปอร์เซ็นต์ (%)' : 'ลดกี่บาท (฿)'}>
                  <input
                    type="number"
                    className="input"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    min="0"
                    step="any"
                  />
                </FormField>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <CustomDateTimePicker
                  startDate={formData.saleStart}
                  endDate={formData.saleEnd}
                  onChange={(start, end) => setFormData(prev => ({ ...prev, saleStart: start, saleEnd: end }))}
                  label="ช่วงเวลาโปรโมชัน"
                />
              </div>
            </>
          )}
        </SectionCard>

        {/* Actions */}
        <div className="admin-actions-bar">
          <button type="submit" className="btn btn-primary btn-lg">
            บันทึกและสร้างสินค้า
          </button>
          <Link href="/admin" className="btn btn-outline">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  )
}
