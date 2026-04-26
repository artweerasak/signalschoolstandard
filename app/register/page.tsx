"use client"
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { api } from "@/lib/api"

const RANK_CHOICES = [
  ["PVT","พลทหาร"],["CPL","สิบตรี"],["SGT3","สิบโท"],["SGT2","สิบเอก"],
  ["SSGT","จ่าสิบตรี"],["MSGT","จ่าสิบโท"],["CSGT","จ่าสิบเอก"],
  ["WO1","พันจ่าตรี"],["WO2","พันจ่าโท"],["WO3","พันจ่าเอก"],
  ["2LT","ร้อยตรี"],["1LT","ร้อยโท"],["CPT","ร้อยเอก"],
  ["MAJ","พันตรี"],["LTCOL","พันโท"],["COL","พันเอก"],
  ["BGEN","พลตรี"],["MGEN","พลโท"],["GEN","พลเอก"],
]

function validateNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === parseInt(id[12])
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name_th: "", rank: "", unit: "",
    national_id: "", military_id: "", birth_date: "", email: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [apiError, setApiError] = useState("")

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: "" }))
    setApiError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!form.full_name_th.trim()) newErrors.full_name_th = "กรุณากรอกชื่อ-นามสกุล"
    if (!form.rank)               newErrors.rank          = "กรุณาเลือกชั้นยศ"
    if (!form.unit.trim())        newErrors.unit          = "กรุณากรอกหน่วยต้นสังกัด"
    if (!form.birth_date)         newErrors.birth_date    = "กรุณากรอกวันเกิด"
    if (!validateNationalId(form.national_id)) newErrors.national_id = "เลขบัตรประชาชน 13 หลักไม่ถูกต้อง"
    if (!/^\d{10}$/.test(form.military_id))    newErrors.military_id = "เลขประจำตัวทหาร 10 หลักไม่ถูกต้อง"

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setLoading(true)
    try {
      await api.register(form)
      setSuccess(true)
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-[#4A1A6B] mb-2">ส่งคำขอเรียบร้อยแล้ว</h2>
          <p className="text-gray-600 mb-6">
            ระบบได้รับคำขอสมัครสมาชิกของคุณแล้ว<br />
            กรุณารอการอนุมัติจากผู้ดูแลระบบ<br />
            ท่านจะได้รับแจ้งทางอีเมลเมื่อได้รับการอนุมัติ
          </p>
          <Link
            href="/login"
            className="inline-block bg-[#4A1A6B] text-white px-6 py-2 rounded-lg hover:bg-[#7B3FA0] transition-colors"
          >
            กลับหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#4A1A6B] px-8 py-7 flex flex-col items-center gap-2">
          <Image src="/signal_logo.png" alt="กรมการทหารสื่อสาร" width={60} height={60} className="rounded-full bg-white p-1" />
          <h1 className="text-white font-bold text-lg text-center">สมัครสมาชิก</h1>
          <p className="text-purple-200 text-sm text-center">ระบบ eLearning กรมการทหารสื่อสาร</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {apiError}
            </div>
          )}

          {/* ชื่อ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล (ภาษาไทย)</label>
            <input
              type="text"
              value={form.full_name_th}
              onChange={e => update("full_name_th", e.target.value)}
              placeholder="เช่น สมชาย ใจกล้า"
              className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] ${errors.full_name_th ? "border-red-400" : "border-gray-300"}`}
            />
            {errors.full_name_th && <p className="text-red-500 text-xs mt-1">{errors.full_name_th}</p>}
          </div>

          {/* ยศ + วันเกิด */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชั้นยศ</label>
              <select
                value={form.rank}
                onChange={e => update("rank", e.target.value)}
                className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white ${errors.rank ? "border-red-400" : "border-gray-300"}`}
              >
                <option value="">เลือกยศ</option>
                {RANK_CHOICES.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              {errors.rank && <p className="text-red-500 text-xs mt-1">{errors.rank}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันเกิด</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={e => update("birth_date", e.target.value)}
                className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] ${errors.birth_date ? "border-red-400" : "border-gray-300"}`}
              />
              {errors.birth_date && <p className="text-red-500 text-xs mt-1">{errors.birth_date}</p>}
            </div>
          </div>

          {/* หน่วย */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หน่วยต้นสังกัด</label>
            <input
              type="text"
              value={form.unit}
              onChange={e => update("unit", e.target.value)}
              placeholder="เช่น กรมการทหารสื่อสาร"
              className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] ${errors.unit ? "border-red-400" : "border-gray-300"}`}
            />
            {errors.unit && <p className="text-red-500 text-xs mt-1">{errors.unit}</p>}
          </div>

          {/* เลขบัตรประชาชน */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัตรประชาชน</label>
            <input
              type="text"
              value={form.national_id}
              onChange={e => update("national_id", e.target.value.replace(/\D/g, "").slice(0, 13))}
              placeholder="1 3456 78901 23 4"
              maxLength={13}
              className={`w-full border rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] ${errors.national_id ? "border-red-400" : "border-gray-300"}`}
            />
            {errors.national_id && <p className="text-red-500 text-xs mt-1">{errors.national_id}</p>}
          </div>

          {/* เลขทหาร */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขประจำตัวทหาร</label>
            <input
              type="text"
              value={form.military_id}
              onChange={e => update("military_id", e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10 หลัก"
              maxLength={10}
              className={`w-full border rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] ${errors.military_id ? "border-red-400" : "border-gray-300"}`}
            />
            {errors.military_id && <p className="text-red-500 text-xs mt-1">{errors.military_id}</p>}
          </div>

          {/* อีเมล (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล (ถ้ามี)</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update("email", e.target.value)}
              placeholder="example@email.com"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4A1A6B] text-white font-semibold py-3 rounded-lg hover:bg-[#7B3FA0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "กำลังส่งคำขอ..." : "ส่งคำขอสมัครสมาชิก"}
          </button>

          <p className="text-center text-sm text-gray-500">
            มีบัญชีแล้ว?{" "}
            <Link href="/login" className="text-[#4A1A6B] hover:underline font-medium">เข้าสู่ระบบ</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
