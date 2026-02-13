
import React from 'react'

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* <div className="bg-card/30 backdrop-blur-xl border border-white/5 p-8 rounded-2xl relative overflow-hidden shadow-2xl"> */}
        {/* Background decoration */}
        {/* <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" /> */}
        {/* <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-red-900/10 rounded-full blur-3xl pointer-events-none" /> */}

        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
            ข้อตกลงการใช้งาน
          </h1>
          <div className="h-1 w-20 bg-red-600 rounded-full mb-10" />

          <div className="space-y-10 text-gray-200">
            {/* Section 1 */}
            <section className="space-y-4 group">
              <h2 className="text-xl font-semibold flex items-center gap-3 text-white group-hover:text-red-400 transition-colors duration-300">
                <span className="w-1 h-8 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                การสนับสนุนเซิร์ฟเวอร์
              </h2>
              <div className="pl-5 ml-0.5 border-l border-white/10 py-1">
                <p className="leading-relaxed text-lg">
                  การเติมเงินเพื่อสนับสนุนเซิร์ฟเวอร์ถือเป็น <span className="text-red-400 font-bold border-b border-red-500/30 pb-0.5">ความยินยอมโดยสมัครใจของผู้เล่น</span> 
                  <br className="hidden md:block" />
                  ทางทีมงานขอขอบคุณทุกการสนับสนุนที่ช่วยให้เราสามารถพัฒนาและดูแลเซิร์ฟเวอร์ต่อไปได้
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section className="space-y-4 group">
              <h2 className="text-xl font-semibold flex items-center gap-3 text-white group-hover:text-red-400 transition-colors duration-300">
                <span className="w-1 h-8 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                นโยบายเกี่ยวกับไอเทม
              </h2>
              <div className="pl-5 ml-0.5 border-l border-white/10 py-1">
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-2.5 flex-shrink-0" />
                    <span className="leading-relaxed">
                      <strong className="text-white font-semibold">ไอเทม กาชา หรือสกิน</strong> ที่ได้รับจากการสนับสนุน <br/>
                      <span className="text-red-400 font-medium">ไม่สามารถเปลี่ยนเป็นเงินสด หรือโอนคืนได้ในทุกกรณี</span>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-2.5 flex-shrink-0" />
                    <span className="leading-relaxed">
                      <strong className="text-white font-semibold">ไอเทมประเภทใช้งาน</strong> (ที่ไม่ใช่สกินหรือของตกแต่งถาวร) <br/>
                      สามารถซื้อและใช้ได้เฉพาะภายใน <span className="text-red-400 font-bold px-2 py-0.5 bg-red-500/10 rounded border border-red-500/20">ซีซั่นปัจจุบัน</span> เท่านั้น
                    </span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section className="space-y-4 group">
              <h2 className="text-xl font-semibold flex items-center gap-3 text-white group-hover:text-red-400 transition-colors duration-300">
                <span className="w-1 h-8 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                การให้บริการ
              </h2>
              <div className="bg-gradient-to-r from-red-950/40 to-transparent border-l-4 border-l-red-600 border-y border-r border-red-900/20 rounded-r-lg p-5 ml-1">
                <p className="text-red-200 font-medium leading-relaxed">
                  ในกรณีที่มีการ <span className="text-white">ปิดปรับปรุงระบบ</span>, <span className="text-white">การเริ่มต้นซีซั่นใหม่</span> หรือ <span className="text-white">การสิ้นสุดการให้บริการเซิร์ฟเวอร์ในอนาคต</span>
                </p>
                <div className="mt-3 flex items-center gap-2 text-red-400 font-bold text-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  ทางทีมงานขอสงวนสิทธิ์ ไม่คืนเงินในทุกกรณี
                </div>
              </div>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-white/5 text-center">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear() > 2025 ? `2025 - ${new Date().getFullYear()}` : '2025'} Luminaris Shop. All rights reserved.
            </p>
          </div>
        </div>
      {/* </div> */}
    </div>
  )
}
