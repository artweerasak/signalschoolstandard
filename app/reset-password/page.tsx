"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"

export default function ResetPasswordPage() {
  const [nationalId, setNationalId] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!/^\d{13}$/.test(nationalId)) {
      setError("กรุณากรอกเลขบัตรประชาชน 13 หลัก")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/military/api/v1/reset-password/request/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ national_id: nationalId }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        const d = await res.json()
        setError(d.error || "เกิดข้อผิดพลาด")
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#4A1A6B] px-8 py-8 flex flex-col items-center gap-3">
          <Image src="/signal_logo.png" alt="กรมการทหารสื่อสาร" width={70} height={70}
            className="rounded-full border-4 border-[#C9A84C] shadow-lg bg-white p-1" priority />
          <div className="text-center">
            <h1 className="text-white text-xl font-bold">รีเซ็ตรหัสผ่าน</h1>
            <p className="text-[#C9A84C] text-sm mt-0.5">กรมการทหารสื่อสาร</p>
          </div>
        </div>

        <div className="px-8 py-8">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="font-bold text-gray-800">ส่งคำขอแล้ว</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                ระบบได้รับคำขอรีเซ็ตรหัสผ่านของคุณแล้ว<br />
                ผู้ดูแลระบบจะดำเนินการและแจ้งรหัสผ่านใหม่ผ่านช่องทางที่กำหนด
              </p>
              <Link href="/login"
                className="block w-full py-3 bg-[#4A1A6B] text-white rounded-lg text-sm font-semibold text-center hover:bg-[#2D0F42] transition">
                กลับหน้าเข้าสู่ระบบ
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-gray-600 text-sm leading-relaxed">
                กรอกเลขบัตรประชาชนเพื่อขอรีเซ็ตรหัสผ่าน ระบบจะแจ้งให้ผู้ดูแลดำเนินการให้
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เลขบัตรประชาชน <span className="text-red-500">*</span>
                </label>
                <input type="text" value={nationalId} onChange={e => setNationalId(e.target.value)}
                  placeholder="กรอกเลขบัตรประชาชน 13 หลัก" maxLength={13}
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
                    ${error ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-[#7B3FA0]"}`} />
                {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-[#4A1A6B] hover:bg-[#2D0F42] disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition text-sm">
                {loading ? "กำลังส่งคำขอ..." : "ขอรีเซ็ตรหัสผ่าน"}
              </button>
              <p className="text-center">
                <Link href="/login" className="text-sm text-[#4A1A6B] hover:underline">
                  ← กลับหน้าเข้าสู่ระบบ
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
