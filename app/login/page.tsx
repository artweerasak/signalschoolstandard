"use client"

/**
 * Login Page — หน้าเข้าสู่ระบบกรมการทหารสื่อสาร
 * สีหลัก: ม่วงเม็ดมะปราง (#4A1A6B) สีประจำเหล่าทหารสื่อสาร
 */

import { useState, useEffect, Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { loginWithMilitaryId } from "@/lib/auth"
import { api } from "@/lib/api"
import Button from "@/components/ui/Button"

function validateNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i)
  const check = (11 - (sum % 11)) % 10
  return check === parseInt(id[12])
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [apiError, setApiError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const err = searchParams.get("error")
    if (!err) return
    const MAP: Record<string, string> = {
      not_authorized: "เลขบัตรประชาชนนี้ยังไม่อยู่ในรายชื่อที่ได้รับอนุญาตให้สมัคร กรุณาติดต่อหน่วยต้นสังกัด",
      thaid_invalid: "การยืนยันตัวตนผ่าน ThaID ไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่",
      thaid_replay: "ลิงก์ยืนยันตัวตนถูกใช้ไปแล้ว กรุณาเริ่มใหม่",
      thaid_no_pid: "ไม่พบเลขบัตรประชาชนจากการยืนยัน ThaID",
      thaid_unconfigured: "ระบบ ThaID ยังไม่พร้อมใช้งาน",
      thaid_denied: "การยืนยันตัวตนถูกยกเลิก",
      account_inactive: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    }
    setApiError(MAP[err] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่")
  }, [searchParams])

  function handleUsernameChange(value: string) {
    setUsername(value)
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
    if (!username.trim()) {
      newErrors.username = "กรุณากรอกเลขบัตรประชาชน หรือ ชื่อผู้ใช้"
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
      // รองรับ OAuth2 SSO redirect สำหรับ Studio
      const next = searchParams.get("next")
      if (next && next.startsWith("/oauth2/")) {
        window.location.href = next
        return
      }
      const user = await api.me()
      if (user.role === "admin" || user.is_staff) {
        router.push("/dashboard")
      } else if (user.role === "instructor") {
        router.push("/instructor")
      } else if (user.role === "prep_school") {
        router.push("/prep-school")
      } else if (user.role === "prep_personnel") {
        router.push("/prep-personnel")
      } else if (user.role === "evaluator") {
        router.push("/evaluator")
      } else {
        router.push("/my")
      }
    } else {
      setLoading(false)
      setApiError(result.error ?? "เกิดข้อผิดพลาด")
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#180626] px-4 py-10">
      {/* พื้นหลัง gradient เข้ม + glow ตกแต่ง ต้นแบบจาก signalschool.ac.th hero */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2D0F42] via-[#3a1456] to-[#180626]" aria-hidden="true" />
      <div
        className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-[#7B3FA0]/25 blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[-15%] right-[-5%] w-[420px] h-[420px] rounded-full bg-[#C9A84C]/15 blur-[110px]"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        {/* Crest ลอยเหนือการ์ด พร้อม glow ring */}
        <div className="flex justify-center -mb-10 relative z-10">
          <div className="relative">
            <span className="absolute inset-0 rounded-full blur-xl bg-[#C9A84C]/40 -z-10 scale-150" aria-hidden="true" />
            <span className="absolute -inset-3 rounded-full border border-[#E8C96A]/30 -z-10" aria-hidden="true" />
            <Image
              src="/signal_logo.png"
              alt="กรมการทหารสื่อสาร"
              width={92}
              height={92}
              className="rounded-full border-4 border-[#C9A84C] shadow-[0_8px_30px_rgba(201,168,76,0.35)] bg-white p-1"
              priority
            />
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] overflow-hidden pt-14">
          <div className="text-center px-8 pb-2">
            <p className="text-[10px] font-mono tracking-[0.2em] text-[#9a92a8] uppercase">
              Royal Thai Army Signal School
            </p>
            <h1 className="text-[#2D0F42] text-xl font-bold tracking-wide mt-1">
              กรมการทหารสื่อสาร
            </h1>
            <p className="text-[#6b6478] text-sm mt-0.5">
              ระบบการเรียนการสอนออนไลน์
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pt-6 pb-8 space-y-5">
            {/* Username (National ID) */}
            <div>
              <label className="block text-sm font-medium text-[#4a4456] mb-1">
                ชื่อผู้ใช้ <span className="text-[#b91c1c]">*</span>
              </label>
              <input
                type="text"
                placeholder="เลขบัตรประชาชน 13 หลัก หรือ ชื่อผู้ใช้"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition
                  ${errors.username
                    ? "border-[#f3a0a0] focus:ring-red-200"
                    : "border-[#d9d2e6] focus:ring-[#C9A84C]/40 focus:border-[#4A1A6B]"
                  }`}
                autoComplete="username"
              />
              {errors.username && (
                <p className="text-[#b91c1c] text-xs mt-1">{errors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#4a4456] mb-1">
                รหัสผ่าน <span className="text-[#b91c1c]">*</span>
              </label>
              <input
                type="password"
                placeholder="กรอกรหัสผ่าน"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition
                  ${errors.password
                    ? "border-[#f3a0a0] focus:ring-red-200"
                    : "border-[#d9d2e6] focus:ring-[#C9A84C]/40 focus:border-[#4A1A6B]"
                  }`}
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="text-[#b91c1c] text-xs mt-1">{errors.password}</p>
              )}
              <p className="text-xs text-[#9a92a8] mt-1">
                รหัสผ่าน default คือเลขประจำตัวทหาร 10 หลัก
              </p>
            </div>

            {/* API Error */}
            {apiError && (
              <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] text-sm px-4 py-2.5 rounded-xl">
                {apiError}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={loading} className="w-full py-3">
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
            </Button>
          </form>

          {process.env.NEXT_PUBLIC_THAID_ENABLED === "1" && (
            <div className="px-8 pb-2">
              <div className="flex items-center gap-3 my-2 text-[#9a92a8] text-xs">
                <span className="h-px bg-[#e6e1ee] flex-1" />หรือ<span className="h-px bg-[#e6e1ee] flex-1" />
              </div>
              <a
                href="/thaid/login"
                className="flex items-center justify-center gap-2 w-full border border-[#4A1A6B]/30 text-[#4A1A6B] rounded-full py-2.5 font-medium hover:bg-[#4A1A6B] hover:text-white transition-colors"
              >
                <span aria-hidden>🪪</span> เข้าสู่ระบบด้วย ThaID
              </a>
              <p className="text-xs text-[#9a92a8] text-center mt-1">ยืนยันตัวตนผ่านแอป ThaID บนมือถือ</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-[#f0ecf6] px-8 py-4 text-center space-y-2">
            <p className="text-sm text-[#6b6478]">
              ยังไม่มีบัญชี?{" "}
              <Link href="/register" className="text-[#4A1A6B] hover:underline font-medium">
                สมัครสมาชิก
              </Link>
            </p>
            <p className="text-xs text-[#9a92a8]">
              หากลืมรหัสผ่าน{" "}
              <Link href="/reset-password" className="text-[#4A1A6B] hover:underline">
                ขอรีเซ็ตรหัสผ่าน
              </Link>
              {" "}หรือติดต่อผู้ดูแลระบบ
            </p>
            {/* PDPA Notice */}
            <p className="text-xs text-[#9a92a8] border-t border-[#f0ecf6] pt-2 leading-relaxed">
              ระบบนี้จัดเก็บข้อมูลส่วนบุคคลเพื่อการเรียนการสอนภายในองค์กรตาม{" "}
              <Link href="/privacy" className="underline hover:text-[#4A1A6B]">
                นโยบายความเป็นส่วนตัว (PDPA)
              </Link>
            </p>
            <p className="text-xs text-[#9a92a8]">
              © {new Date().getFullYear()} กรมการทหารสื่อสาร · กรมทหารสื่อสาร
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  )
}
