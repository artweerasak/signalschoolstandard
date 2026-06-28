"use client"

import { useEffect, useState } from "react"
import { CAPACITY_EXCEEDED_EVENT } from "@/lib/api"

export default function CapacityExceededModal() {
  const [show, setShow]     = useState(false)
  const [active, setActive] = useState(0)
  const [limit, setLimit]   = useState(300)

  useEffect(() => {
    function onCapacity(e: Event) {
      const ev = e as CustomEvent<{ active: number; limit: number }>
      setActive(ev.detail?.active ?? 300)
      setLimit(ev.detail?.limit ?? 300)
      setShow(true)
    }
    window.addEventListener(CAPACITY_EXCEEDED_EVENT, onCapacity)
    return () => window.removeEventListener(CAPACITY_EXCEEDED_EVENT, onCapacity)
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center space-y-4">
        <div className="text-5xl">🚦</div>
        <h2 className="text-xl font-bold text-red-600">ผู้ใช้งานเต็มแล้ว</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          ขณะนี้มีผู้ใช้งานในระบบ{" "}
          <strong className="text-red-500">{active} / {limit} คน</strong>{" "}
          เกินกว่าที่ระบบรองรับได้พร้อมกัน
        </p>
        <p className="text-gray-400 text-xs">
          กรุณารอสักครู่แล้วกดลองใหม่ — ระบบจะเปิดรับอัตโนมัติเมื่อมีผู้ใช้ออกจากระบบ
        </p>
        <button
          onClick={() => { setShow(false); window.location.reload() }}
          className="w-full py-3 bg-[#4A1A6B] text-white rounded-xl font-semibold hover:bg-[#2D0F42] transition text-sm"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  )
}
