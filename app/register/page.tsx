/**
 * app/register/page.tsx
 * หน้าสมัครสมาชิกด้วยตัวเอง → PendingRegistration (รอ Admin อนุมัติ)
 */
"use client"
import { useState, useEffect } from "react"
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

const ARMY_REGION_CHOICES = [
  ["", "ไม่ระบุ / ส่วนกลาง"],
  ["1", "ทัพภาคที่ 1"],
  ["2", "ทัพภาคที่ 2"],
  ["3", "ทัพภาคที่ 3"],
  ["4", "ทัพภาคที่ 4"],
]

const MONTHS_TH = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
]

/** วันที่แบบ พ.ศ. — คืนค่า YYYY-MM-DD (ค.ศ.) ให้ API */
function BuddhistDateInput({ value, onChange, hasError }: {
  value: string; onChange: (v: string) => void; hasError?: boolean
}) {
  function parse(v: string) {
    if (!v) return { day: 0, month: 0, beYear: 0 }
    const p = v.split("-").map(Number)
    return { day: p[2]||0, month: p[1]||0, beYear: p[0] ? p[0]+543 : 0 }
  }
  const [sel, setSel] = useState(() => parse(value))
  useEffect(() => { setSel(parse(value)) }, [value])

  function emit(d: number, m: number, be: number) {
    setSel({ day: d, month: m, beYear: be })
    if (d && m && be >= 2400) {
      const ce = be - 543
      onChange(String(ce).padStart(4,"0")+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0"))
    } else {
      onChange("")
    }
  }

  const { day, month, beYear } = sel
  const base = "border rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white"
  const err  = hasError ? "border-red-400" : "border-gray-300"
  return (
    <div className="grid grid-cols-3 gap-1">
      <select value={day || ""} onChange={e => emit(Number(e.target.value), month, beYear)}
        className={`${base} ${err}`}>
        <option value="">วัน</option>
        {Array.from({length:31},(_,i)=>i+1).map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={month || ""} onChange={e => emit(day, Number(e.target.value), beYear)}
        className={`${base} ${err}`}>
        <option value="">เดือน</option>
        {MONTHS_TH.map((name,i) => <option key={i+1} value={i+1}>{name}</option>)}
      </select>
      <input type="number" value={beYear || ""} placeholder="ปี พ.ศ."
        min={2400} max={2620}
        onChange={e => emit(day, month, Number(e.target.value))}
        className={`${base} ${err} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} />
    </div>
  )

}
function validateNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(id[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === parseInt(id[12])
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name_th: "", rank: "", unit: "", sub_unit: "", army_region: "",
    national_id: "", military_id: "", birth_date: "",
    phone_number: "", email: "",
  })
  const [errors, setErrors]   = useState<Record<string, string>>({})
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
    if (!form.rank)                newErrors.rank          = "กรุณาเลือกชั้นยศ"
    if (!form.unit.trim())         newErrors.unit          = "กรุณากรอกหน่วยต้นสังกัด"
    if (!form.birth_date)          newErrors.birth_date    = "กรุณากรอกวันเกิด"
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
          <Link href="/login" className="inline-block bg-[#4A1A6B] text-white px-6 py-2 rounded-lg hover:bg-[#7B3FA0] transition-colors">
            กลับหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  const inputCls = (field: string) =>
    `w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] ${errors[field] ? "border-red-400" : "border-gray-300"}`

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#4A1A6B] px-8 py-7 flex flex-col items-center gap-2">
          <Image src="/signal_logo.png" alt="กรมการทหารสื่อสาร" width={60} height={60} className="rounded-full bg-white p-1" />
          <h1 className="text-white font-bold text-lg text-center">สมัครสมาชิก</h1>
          <p className="text-purple-200 text-sm text-center">ระบบ eLearning กรมการทหารสื่อสาร</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{apiError}</div>
          )}

          {/* ชื่อ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล (ภาษาไทย) <span className="text-red-500">*</span></label>
            <input type="text" value={form.full_name_th} onChange={e => update("full_name_th", e.target.value)}
              placeholder="เช่น สมชาย ใจกล้า" className={inputCls("full_name_th")} />
            {errors.full_name_th && <p className="text-red-500 text-xs mt-1">{errors.full_name_th}</p>}
          </div>

          {/* ยศ + วันเกิด */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชั้นยศ <span className="text-red-500">*</span></label>
              <select value={form.rank} onChange={e => update("rank", e.target.value)}
                className={`${inputCls("rank")} bg-white`}>
                <option value="">เลือกยศ</option>
                {RANK_CHOICES.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              {errors.rank && <p className="text-red-500 text-xs mt-1">{errors.rank}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันเกิด <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(พ.ศ.)</span>
              </label>
              <BuddhistDateInput value={form.birth_date} onChange={v => update("birth_date", v)} hasError={!!errors.birth_date} />
              {errors.birth_date && <p className="text-red-500 text-xs mt-1">{errors.birth_date}</p>}
            </div>
          </div>

          {/* ทัพภาค */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ทัพภาค</label>
            <select value={form.army_region} onChange={e => update("army_region", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
              {ARMY_REGION_CHOICES.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          {/* หน่วยต้นสังกัด */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หน่วยต้นสังกัด <span className="text-red-500">*</span></label>
            <input type="text" value={form.unit} onChange={e => update("unit", e.target.value)}
              placeholder="เช่น กรมการทหารสื่อสาร" className={inputCls("unit")} />
            {errors.unit && <p className="text-red-500 text-xs mt-1">{errors.unit}</p>}
          </div>

          {/* หน่วยรอง */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หน่วยรอง <span className="text-gray-400 font-normal">(ถ้ามี)</span></label>
            <input type="text" value={form.sub_unit} onChange={e => update("sub_unit", e.target.value)}
              placeholder="เช่น กองพันทหารสื่อสารที่ 1"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          </div>

          {/* เลขบัตรประชาชน */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัตรประชาชน <span className="text-red-500">*</span></label>
            <input type="text" value={form.national_id}
              onChange={e => update("national_id", e.target.value.replace(/\D/g, "").slice(0, 13))}
              placeholder="1 3456 78901 23 4" maxLength={13}
              className={`${inputCls("national_id")} font-mono`} />
            {errors.national_id && <p className="text-red-500 text-xs mt-1">{errors.national_id}</p>}
          </div>

          {/* เลขทหาร */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขประจำตัวทหาร <span className="text-red-500">*</span></label>
            <input type="text" value={form.military_id}
              onChange={e => update("military_id", e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10 หลัก" maxLength={10}
              className={`${inputCls("military_id")} font-mono`} />
            {errors.military_id && <p className="text-red-500 text-xs mt-1">{errors.military_id}</p>}
          </div>

          {/* เบอร์โทร + อีเมล */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์ <span className="text-gray-400 font-normal">(ถ้ามี)</span></label>
              <input type="tel" value={form.phone_number} onChange={e => update("phone_number", e.target.value)}
                placeholder="0812345678"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล <span className="text-gray-400 font-normal">(ถ้ามี)</span></label>
              <input type="email" value={form.email} onChange={e => update("email", e.target.value)}
                placeholder="email@example.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-[#4A1A6B] text-white font-semibold py-3 rounded-lg hover:bg-[#7B3FA0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2">
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
