/**
 * app/dashboard/reports/pdx-export/page.tsx
 * ส่งออกรายชื่อกำลังพลเป็นฟอร์ม Excel สำหรับนำเข้าระบบ PDX ของ ทบ.
 * เลือกได้: ทั้งหมด / เฉพาะทัพภาค / เฉพาะหน่วย
 */
"use client"

import { useState } from "react"

const REGIONS = [
  { value: "", label: "ทั้งหมด (ทุกทัพภาค)" },
  { value: "1", label: "ทัพภาคที่ 1" },
  { value: "2", label: "ทัพภาคที่ 2" },
  { value: "3", label: "ทัพภาคที่ 3" },
  { value: "4", label: "ทัพภาคที่ 4" },
]

export default function PdxExportPage() {
  const [region, setRegion] = useState("")
  const [unit, setUnit] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState("")

  async function handleExport() {
    setLoading(true); setError(""); setDone("")
    try {
      const params = new URLSearchParams()
      if (region) params.set("army_region", region)
      if (unit.trim()) params.set("unit", unit.trim())

      const res = await fetch(`/military/api/v1/reports/export/pdx/?${params.toString()}`, {
        credentials: "include",
      })
      if (res.status === 401 || res.status === 403) throw new Error("ไม่มีสิทธิ์ (ต้องเป็นแอดมิน)")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const cd = res.headers.get("Content-Disposition") || ""
      const m = cd.match(/filename="?([^"]+)"?/)
      const a = document.createElement("a")
      a.href = url
      a.download = m ? m[1] : "pdx_export.xlsx"
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setDone("ดาวน์โหลดไฟล์เรียบร้อย ✅")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ กรุณาลองใหม่")
    } finally {
      setLoading(false)
    }
  }

  const scopeText = region
    ? `เฉพาะ${REGIONS.find(r => r.value === region)?.label}`
    : "กำลังพลทั้งหมด"

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-[#2D0F42]">📤 ส่งออกฟอร์ม PDX</h2>
        <p className="text-sm text-gray-500 mt-1">
          ส่งออกรายชื่อกำลังพลเป็นไฟล์ Excel ตามฟอร์มสำหรับ <b>นำเข้าระบบ PDX ของ ทบ.</b>
        </p>
      </div>

      {/* กล่องเลือกขอบเขต + ปุ่มดาวน์โหลด */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">ขอบเขต (ทัพภาค)</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4A1A6B] outline-none"
            >
              {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">เฉพาะหน่วย (ไม่บังคับ)</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="พิมพ์ชื่อหน่วย เช่น กรมการทหารสื่อสาร"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4A1A6B] outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={loading}
            className="bg-[#4A1A6B] hover:bg-[#3a1454] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
          >
            {loading ? "กำลังสร้างไฟล์..." : "⬇ ดาวน์โหลดไฟล์ PDX (.xlsx)"}
          </button>
          <span className="text-sm text-gray-500">ขอบเขต: <b>{scopeText}</b>{unit.trim() ? ` · หน่วย “${unit.trim()}”` : ""}</span>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">⚠️ {error}</p>}
        {done && <p className="mt-3 text-sm text-emerald-600">{done}</p>}
      </div>

      {/* คำอธิบายสำหรับแอดมิน */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-gray-700 leading-relaxed">
        <h3 className="font-bold text-[#2D0F42] mb-2">📌 คำอธิบาย (สำหรับแอดมิน)</h3>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b>ไฟล์นี้คืออะไร:</b> รายชื่อกำลังพลพร้อมผลการศึกษา ในรูปแบบ 4 คอลัมน์ที่ระบบ <b>PDX</b> ของ ทบ. รับนำเข้าได้ทันที</li>
          <li><b>คอลัมน์ในไฟล์:</b> เลขบัตรประชาชน · ยศ ชื่อ-สกุล · สังกัด · ผลการศึกษา (ผ่าน/ไม่ผ่าน)</li>
          <li><b>ผลการศึกษา:</b> “ผ่าน” = ผ่านหลักสูตรที่กำหนดตามชั้นยศครบและใบรับรองยังไม่หมดอายุ · นอกนั้นเป็น “ไม่ผ่าน”</li>
          <li><b>วิธีเลือกข้อมูล:</b> เลือก “ทั้งหมด”, เจาะจงทัพภาค, หรือพิมพ์ชื่อหน่วยเพื่อกรองเฉพาะหน่วย แล้วกดดาวน์โหลด</li>
          <li><b>นำเข้า PDX:</b> เปิดระบบ PDX → เมนูนำเข้า → เลือกไฟล์ที่ดาวน์โหลดนี้ (ห้ามแก้หัวตาราง/ชื่อชีต)</li>
          <li className="text-gray-500">* เลขบัตรถูกเก็บเป็น “ข้อความ” กัน Excel ตัดเลข 0 นำหน้า · การส่งออกต้องมีสิทธิ์แอดมิน</li>
        </ul>
      </div>

      <div className="mt-5">
        <a href="/dashboard/reports" className="text-sm text-[#4A1A6B] hover:underline">← กลับหน้ารายงาน</a>
      </div>
    </div>
  )
}
