import { useState, useEffect } from 'react'
import CustomTimePicker from './CustomTimePicker'

interface CustomDateTimePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  label?: string
}

export default function CustomDateTimePicker({
  startDate,
  endDate,
  onChange,
  label = 'ช่วงเวลาโปรโมชัน (ปฏิทินช่วงเวลา)'
}: CustomDateTimePickerProps) {
  // Premium Calendar Local States
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())

  // Keep calendar view synced with startDate when selected or loaded
  useEffect(() => {
    if (startDate) {
      const d = new Date(startDate)
      if (!isNaN(d.getTime())) {
        setCalendarMonth(d.getMonth())
        setCalendarYear(d.getFullYear())
      }
    }
  }, [startDate])

  const monthsTH = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ]

  const formatDateTimeLocalHelper = (date: Date, timeStr: string = '00:00') => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}T${timeStr}`
  }

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay()

  const handleCalendarDayClick = (dayNum: number) => {
    const clickedDate = new Date(calendarYear, calendarMonth, dayNum)
    let startTime = '00:00'
    let endTime = '23:59'
    
    if (startDate) {
      const parts = startDate.split('T')
      if (parts[1]) startTime = parts[1]
    }
    if (endDate) {
      const parts = endDate.split('T')
      if (parts[1]) endTime = parts[1]
    }

    const startVal = startDate ? new Date(startDate) : null
    const endVal = endDate ? new Date(endDate) : null

    if (!startVal || (startVal && endVal)) {
      const newStart = formatDateTimeLocalHelper(clickedDate, startTime)
      onChange(newStart, '')
    } else {
      if (clickedDate < startVal) {
        const newStart = formatDateTimeLocalHelper(clickedDate, startTime)
        onChange(newStart, '')
      } else {
        const newEnd = formatDateTimeLocalHelper(clickedDate, endTime)
        onChange(startDate, newEnd)
      }
    }
  }

  const isSelectedDate = (dayNum: number) => {
    const d = new Date(calendarYear, calendarMonth, dayNum)
    const startVal = startDate ? new Date(startDate.split('T')[0] + 'T00:00:00') : null
    const endVal = endDate ? new Date(endDate.split('T')[0] + 'T00:00:00') : null
    const currentD = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    if (startVal && currentD.getTime() === new Date(startVal.getFullYear(), startVal.getMonth(), startVal.getDate()).getTime()) {
      return 'date-start'
    }
    if (endVal && currentD.getTime() === new Date(endVal.getFullYear(), endVal.getMonth(), endVal.getDate()).getTime()) {
      return 'date-end'
    }
    if (startVal && endVal && currentD > startVal && currentD < endVal) {
      return 'date-range'
    }
    return ''
  }

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11)
      setCalendarYear(prev => prev - 1)
    } else {
      setCalendarMonth(prev => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0)
      setCalendarYear(prev => prev + 1)
    } else {
      setCalendarMonth(prev => prev + 1)
    }
  }

  const clearPromoDates = () => {
    onChange('', '')
  }

  const getHourValue = (dateTimeStr: string, defaultVal: string = '00') => {
    if (!dateTimeStr) return defaultVal
    const parts = dateTimeStr.split('T')
    if (parts[1]) {
      return parts[1].split(':')[0] || defaultVal
    }
    return defaultVal
  }

  const getMinuteValue = (dateTimeStr: string, defaultVal: string = '00') => {
    if (!dateTimeStr) return defaultVal
    const parts = dateTimeStr.split('T')
    if (parts[1]) {
      return parts[1].split(':')[1] || defaultVal
    }
    return defaultVal
  }

  const updatePromoTime = (type: 'start' | 'end', unit: 'hour' | 'minute', val: string) => {
    if (type === 'start') {
      if (!startDate) return
      const datePart = startDate.split('T')[0]
      const currentH = getHourValue(startDate, '00')
      const currentM = getMinuteValue(startDate, '00')
      
      const newH = unit === 'hour' ? val : currentH
      const newM = unit === 'minute' ? val : currentM
      
      onChange(`${datePart}T${newH}:${newM}`, endDate)
    } else {
      if (!endDate) return
      const datePart = endDate.split('T')[0]
      const currentH = getHourValue(endDate, '23')
      const currentM = getMinuteValue(endDate, '59')
      
      const newH = unit === 'hour' ? val : currentH
      const newM = unit === 'minute' ? val : currentM
      
      onChange(startDate, `${datePart}T${newH}:${newM}`)
    }
  }

  const hoursList = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutesList = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

  return (
    <div className="custom-datetime-picker">
      <div className="flex-between mb-2">
        <label className="form-label text-sm font-semibold">{label}</label>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={clearPromoDates}
            className="text-xs border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold px-3 py-1.5 rounded-lg shadow-md hover:shadow-rose-500/10 transition-all duration-200"
          >
            ล้างค่าวันที่
          </button>
        )}
      </div>

      {/* DUAL COLUMN RESPONSIVE GRID */}
      <div className="picker-layout-grid">
        {/* LEFT COLUMN: Calendar */}
        <div className="calendar-section">
          <div className="calendar-container">
            <div className="calendar-header">
              <button type="button" className="btn btn-icon btn-sm btn-outline" onClick={handlePrevMonth} style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }}>
                &larr;
              </button>
              <span className="font-semibold text-sm">
                {monthsTH[calendarMonth]} {calendarYear}
              </span>
              <button type="button" className="btn btn-icon btn-sm btn-outline" onClick={handleNextMonth} style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }}>
                &rarr;
              </button>
            </div>

            <div className="calendar-grid">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((day) => (
                <div key={day} className="calendar-weekday">{day}</div>
              ))}

              {Array(getFirstDayOfMonth(calendarYear, calendarMonth)).fill(null).map((_, idx) => (
                <div key={`empty-${idx}`} />
              ))}

              {Array.from({ length: getDaysInMonth(calendarYear, calendarMonth) }, (_, i) => i + 1).map((dayNum) => {
                const stateClass = isSelectedDate(dayNum)
                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    onClick={() => handleCalendarDayClick(dayNum)}
                    className={`calendar-day-btn ${stateClass}`}
                  >
                    {dayNum}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Time Pickers, Summary, Hints */}
        <div className="time-details-section">
          {/* CUSTOM TIME PICKERS FOR START & END */}
          <div className="time-selectors-grid">
            <div className="form-group">
              <label className="form-label text-xs">เวลาเริ่มต้น (24h)</label>
              <div className="time-row">
                <CustomTimePicker
                  value={getHourValue(startDate, '00')}
                  options={hoursList}
                  onChange={(val) => updatePromoTime('start', 'hour', val)}
                  suffix="น."
                  disabled={!startDate}
                  placeholder="ชั่วโมง"
                />
                <span className="text-muted-foreground self-center" style={{ padding: '0 0.25rem' }}>:</span>
                <CustomTimePicker
                  value={getMinuteValue(startDate, '00')}
                  options={minutesList}
                  onChange={(val) => updatePromoTime('start', 'minute', val)}
                  suffix="นาที"
                  disabled={!startDate}
                  placeholder="นาที"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label text-xs">เวลาสิ้นสุด (24h)</label>
              <div className="time-row">
                <CustomTimePicker
                  value={getHourValue(endDate, '23')}
                  options={hoursList}
                  onChange={(val) => updatePromoTime('end', 'hour', val)}
                  suffix="น."
                  disabled={!endDate}
                  placeholder="ชั่วโมง"
                />
                <span className="text-muted-foreground self-center" style={{ padding: '0 0.25rem' }}>:</span>
                <CustomTimePicker
                  value={getMinuteValue(endDate, '59')}
                  options={minutesList}
                  onChange={(val) => updatePromoTime('end', 'minute', val)}
                  suffix="นาที"
                  disabled={!endDate}
                  placeholder="นาที"
                />
              </div>
            </div>
          </div>

          {/* SUMMARY INFORMATION */}
          {startDate && (
            <div className="summary-card" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.15)', padding: '0.75rem', borderRadius: '0.5rem', color: 'var(--primary)' }}>
              <p style={{ margin: 0, paddingBottom: '0.25rem', fontSize: '0.75rem' }}>
                <strong>เริ่มต้น:</strong> {new Date(startDate).toLocaleString('th-TH')}
              </p>
              {endDate ? (
                <p style={{ margin: 0, fontSize: '0.75rem' }}>
                  <strong>สิ้นสุด:</strong> {new Date(endDate).toLocaleString('th-TH')}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: '0.75rem' }}><strong>สิ้นสุด:</strong> มีผลไม่มีกำหนด (ใช้ได้ถาวรจนกว่าจะปิดคูปอง/แคมเปญ)</p>
              )}
            </div>
          )}

          {/* USAGE INSTRUCTIONS */}
          <p className="form-hint">
            วิธีใช้: จิ้มเลือก <strong>วันเริ่มต้น</strong> บนปฏิทิน จากนั้นจิ้มเลือก <strong>วันสิ้นสุด</strong> เป็นลำดับถัดไป จากนั้นสามารถตั้งเวลาละเอียดได้จากกล่อง Dropdown
          </p>
        </div>
      </div>

      <style jsx>{`
        .custom-datetime-picker {
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .flex-between {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .picker-layout-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          margin-top: 0.25rem;
          width: 100%;
        }
        @media (min-width: 768px) {
          .picker-layout-grid {
            grid-template-columns: 1.15fr 0.85fr;
            align-items: start;
          }
        }
        .calendar-section {
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .time-details-section {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          justify-content: flex-start;
          width: 100%;
        }
        .time-selectors-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .time-row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.25rem;
          flex-wrap: nowrap;
        }
        .form-label {
          color: var(--foreground);
        }
        .form-hint {
          font-size: 0.72rem;
          color: var(--muted-foreground);
          margin-top: 0.15rem;
          line-height: 1.45;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        /* Premium Date Range Calendar Styles */
        .calendar-container {
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
          width: 100%;
        }
        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 5px;
          text-align: center;
        }
        .calendar-weekday {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--muted-foreground);
          padding: 0.2rem 0;
        }
        .calendar-day-btn {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: var(--foreground);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .calendar-day-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-1px);
        }
        .calendar-day-btn.date-start {
          background: var(--primary) !important;
          color: #ffffff !important;
          font-weight: bold;
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
          border-radius: 8px 0 0 8px;
        }
        .calendar-day-btn.date-end {
          background: #10b981 !important;
          color: #ffffff !important;
          font-weight: bold;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
          border-radius: 0 8px 8px 0;
        }
        .calendar-day-btn.date-range {
          background: rgba(34, 197, 94, 0.15) !important;
          color: var(--primary) !important;
          border-radius: 0;
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}
