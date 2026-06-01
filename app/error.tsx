"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] flex items-center justify-center px-4">
      <div className="text-center space-y-6">
        <div className="text-8xl font-black text-white opacity-20 select-none">500</div>
        <div className="-mt-10 space-y-2">
          <h1 className="text-2xl font-bold text-white">เกิดข้อผิดพลาด</h1>
          <p className="text-purple-300 text-sm">ระบบพบปัญหาที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง</p>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={reset}
            className="px-5 py-2.5 bg-white text-[#4A1A6B] rounded-lg font-semibold text-sm hover:bg-purple-50 transition">
            ลองใหม่
          </button>
          <Link href="/"
            className="px-5 py-2.5 border border-white text-white rounded-lg font-semibold text-sm hover:bg-white/10 transition">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  )
}
