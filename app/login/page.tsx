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
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i)
  const check = (11 - (sum % 11)) % 10
  return check === parseInt(id[12])
}

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [apiError, setApiError] = useState("")
  const [loading, setLoading] = useState(false)

  function handleUsernameChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 13)
    setUsername(digits)
    if (errors.username) setErrors((e) => ({ ...e, username: undefined }))
  }

  function handlePasswordChange(value: string) {
    setPassword(value)
    if (errors.password) setErrors((e) => ({ ...e, password: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError("")

    const newErrors: typeof errors = {}
    if (!validateNationalId(username)) {
      newErrors.username = "เลขบัตรประชาชน 13 หลักไม่ถูกต้อง"
    }
    if (!password) {
      newErrors.password = "กรุณากรอกรหัสผ่าน"
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    const result = await loginWithMilitaryId(username, password)

    if (result.success) {
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
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
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

          {/* Username (National ID) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อผู้ใช้ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="เลขบัตรประชาชน 13 หลัก"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
                ${errors.username
                  ? "border-red-400 focus:ring-red-300"
                  : "border-gray-300 focus:ring-[#7B3FA0] focus:border-[#4A1A6B]"
                }`}
              autoComplete="username"
            />
            {errors.username && (
              <p className="text-red-500 text-xs mt-1">{errors.username}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              รหัสผ่าน <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              placeholder="กรอกรหัสผ่าน"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
                ${errors.password
                  ? "border-red-400 focus:ring-red-300"
                  : "border-gray-300 focus:ring-[#7B3FA0] focus:border-[#4A1A6B]"
                }`}
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              รหัสผ่าน default คือเลขประจำตัวทหาร 10 หลัก
            </p>
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
            หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ต
          </p>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} กรมการทหารสื่อสาร · กรมทหารสื่อสาร
          </p>
        </div>
      </div>
    </div>
  )
}
