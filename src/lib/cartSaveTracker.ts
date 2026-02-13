/**
 * Cart Save Tracker — Module-level state ที่ shared ระหว่าง shop page และ cart page
 * 
 * ป้องกัน SWR revalidation ไม่ให้ทับ optimistic data ด้วย stale data จาก DB
 * ขณะที่ save ยังไม่เสร็จ
 */

/** จำนวน save operations ที่กำลังทำอยู่ */
let _savesInFlight = 0

export function cartSaveStarted(): void {
  _savesInFlight++
}

export function cartSaveCompleted(): void {
  _savesInFlight = Math.max(0, _savesInFlight - 1)
}

export function hasCartSavesInFlight(): boolean {
  return _savesInFlight > 0
}

/** Reset counter (e.g., on user logout) */
export function resetCartSaveTracker(): void {
  _savesInFlight = 0
}
