"use client"

/**
 * Login Page — หน้าเข้าสู่ระบบกรมการทหารสื่อสาร
 * สีหลัก: ม่วงเม็ดมะปราง (#4A1A6B) สีประจำเหล่าทหารสื่อสาร
 */

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { loginWithMilitaryId } from "@/lib/auth"
import { api } from "@/lib/api"

function validateNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  // checksum ตรวจ digit สุดท้าย
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i)
  const check = (11 - (sum % 11)) % 10
  return check === parseInt(id[12])
}

function validateMilitaryId(id: string): boolean {
  return /^\d{10}$/.test(id)
}

export default function LoginPage() {
  const router = useRouter()
  const [nationalId, setNationalId] = useState("")
  const [militaryId, setMilitaryId] = useState("")
  const [errors, setErrors] = useState<{ nationalId?: string; militaryId?: string }>({})
  const [apiError, setApiError] = useState("")
  const [loading, setLoading] = useState(false)

  function handleNationalIdChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 13)
    setNationalId(digits)
    if (errors.nationalId) setErrors((e) => ({ ...e, nationalId: undefined }))
  }

  function handleMilitaryIdChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 10)
    setMilitaryId(digits)
    if (errors.militaryId) setErrors((e) => ({ ...e, militaryId: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError("")

    const newErrors: typeof errors = {}
    if (!validateNationalId(nationalId)) {
      newErrors.nationalId = "เลขบัตรประชาชน 13 หลักไม่ถูกต้อง"
    }
    if (!validateMilitaryId(militaryId)) {
      newErrors.militaryId = "เลขประจำตัวทหาร 10 หลักไม่ถูกต้อง"
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    const result = await loginWithMilitaryId(nationalId, militaryId)

    if (result.success) {
      // เช็ค role แล้ว redirect ไปหน้าที่เหมาะสม
      const user = await api.me()
      if (user.role === "admin" || user.is_staff) {
        router.push("/dashboard")
      } else if (user.role === "instructor") {
        router.push("/instructor")
      } else {
        router.push("/my")
      }
    } else {
      setLoading(false)
      setApiError(result.error ?? "เกิดข้อผิดพลาด")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] px-4">
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header — แถบสีม่วง */}
        <div className="bg-[#4A1A6B] px-8 py-8 flex flex-col items-center gap-3">
          <Image
            src="/signal_logo.png"
            alt="กรมการทหารสื่อสาร"
            width={90}
            height={90}
            className="rounded-full border-4 border-[#C9A84C] shadow-lg bg-white p-1"
            priority
          />
          <div className="text-center">
            <h1 className="text-white text-xl font-bold tracking-wide">
              กรมการทหารสื่อสาร
            </h1>
            <p className="text-[#C9A84C] text-sm mt-0.5">
              กรมทหารสื่อสาร · ระบบการเรียนการสอนออนไลน์
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
          <p className="text-center text-[#4A1A6B] font-semibold text-base">
            เข้าสู่ระบบ
          </p>

          {/* National ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เลขบัตรประชาชน <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="หมายเลข 13 หลัก"
              value={nationalId}
              onChange={(e) => handleNationalIdChange(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
                ${errors.nationalId
                  ? "border-red-400 focus:ring-red-300"
                  : "border-gray-300 focus:ring-[#7B3FA0] focus:border-[#4A1A6B]"
                }`}
              autoComplete="username"
            />
            {errors.nationalId && (
              <p className="text-red-500 text-xs mt-1">{errors.nationalId}</p>
            )}
          </div>

          {/* Military ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เลขประจำตัวทหาร <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              placeholder="หมายเลข 10 หลัก"
              value={militaryId}
              onChange={(e) => handleMilitaryIdChange(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
                ${errors.militaryId
                  ? "border-red-400 focus:ring-red-300"
                  : "border-gray-300 focus:ring-[#7B3FA0] focus:border-[#4A1A6B]"
                }`}
              autoComplete="current-password"
            />
            {errors.militaryId && (
              <p className="text-red-500 text-xs mt-1">{errors.militaryId}</p>
            )}
          </div>

          {/* API Error */}
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
              {apiError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4A1A6B] hover:bg-[#2D0F42] disabled:bg-[#9B7AB8] text-white font-semibold py-3 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              "เข้าสู่ระบบ"
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4 text-center space-y-2">
          <p className="text-sm text-gray-500">
            ยังไม่มีบัญชี?{" "}
            <Link href="/register" className="text-[#4A1A6B] hover:underline font-medium">
              สมัครสมาชิก
            </Link>
          </p>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} กรมการทหารสื่อสาร · กรมทหารสื่อสาร
          </p>
        </div>
      </div>
    </div>
  )
}
