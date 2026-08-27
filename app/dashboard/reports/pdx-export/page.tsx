/**
 * app/dashboard/reports/pdx-export/page.tsx
 * ส่งออกรายชื่อกำลังพลเป็นฟอร์ม Excel สำหรับนำเข้าระบบ PDX ของ ทบ.
 * - เลือกทัพภาค + หลายหน่วย (autocomplete จากหน่วยจริง กันพิมพ์ผิด)
 * - พรีวิวจำนวนคนที่จะ export (ผ่าน/ไม่ผ่าน) ก่อนดาวน์โหลด
 */
"use client"

import { useEffect, useMemo, useState } from "react"

const REGIONS = [
  { value: "", label: "ทั้งหมด (ทุกทัพภาค)" },
  { value: "1", label: "ทัพภาคที่ 1" },
  { value: "2", label: "ทัพภาคที่ 2" },
  { value: "3", label: "ทัพภาคที่ 3" },
  { value: "4", label: "ทัพภาคที่ 4" },
]

type Count = { count: number; passed: number; not_passed: number }

export default function PdxExportPage() {
  const [region, setRegion] = useState("")
  const [units, setUnits] = useState<string[]>([])
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [unitInput, setUnitInput] = useState("")
  const [count, setCount] = useState<Count | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState("")

  const unitsParam = useMemo(() => selected.join(","), [selected])

  // โหลดรายชื่อหน่วยเมื่อเปลี่ยนทัพภาค (+ ล้างที่เลือกไว้)
  useEffect(() => {
    let cancelled = false
    setLoadingUnits(true); setSelected([]); setUnitInput("")
    const p = new URLSearchParams()
    if (region) p.set("army_region", region)
    ;(async () => {
      try {
        const res = await fetch(`/military/api/v1/reports/units/?${p.toString()}`, { credentials: "include" })
        const data = await res.json()
        if (!cancelled) setUnits(Array.isArray(data.units) ? data.units : [])
      } catch {
        if (!cancelled) setUnits([])
      } finally {
        if (!cancelled) setLoadingUnits(false)
      }
    })()
    return () => { cancelled = true }
  }, [region])

  // พรีวิวจำนวนคน (debounce) เมื่อเปลี่ยนทัพภาค/หน่วยที่เลือก
  useEffect(() => {
    let cancelled = false
    setLoadingCount(true)
    const t = setTimeout(async () => {
      const p = new URLSearchParams()
      if (region) p.set("army_region", region)
      if (unitsParam) p.set("units", unitsParam)
      try {
        const res = await fetch(`/military/api/v1/reports/export/count/?${p.toString()}`, { credentials: "include" })
        const data = await res.json()
        if (!cancelled) setCount({ count: data.count ?? 0, passed: data.passed ?? 0, not_passed: data.not_passed ?? 0 })
      } catch {
        if (!cancelled) setCount(null)
      } finally {
        if (!cancelled) setLoadingCount(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [region, unitsParam])

  function addUnit(value: string) {
    const v = value.trim()
    if (v && units.includes(v) && !selected.includes(v)) {
      setSelected((s) => [...s, v]); setUnitInput(""); setError("")
    }
  }
  function removeUnit(u: string) { setSelected((s) => s.filter((x) => x !== u)) }

  async function handleExport() {
    setLoading(true); setError(""); setDone("")
    try {
      const p = new URLSearchParams()
      if (region) p.set("army_region", region)
      if (unitsParam) p.set("units", unitsParam)
      const res = await fetch(`/military/api/v1/reports/export/pdx/?${p.toString()}`, { credentials: "include" })
      if (res.status === 401 || res.status === 403) throw new Error("ไม่มีสิทธิ์ (ต้องเป็นแอดมิน)")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const cd = res.headers.get("Content-Disposition") || ""
      const m = cd.match(/filename="?([^"]+)"?/)
      const a = document.createElement("a")
      a.href = url; a.download = m ? m[1] : "pdx_export.xlsx"
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setDone("ดาวน์โหลดไฟล์เรียบร้อย ✅")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ กรุณาลองใหม่")
    } finally {
      setLoading(false)
    }
  }

  const scopeText = region ? REGIONS.find(r => r.value === region)?.label : "ทุกทัพภาค"

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-[#2D0F42]">📤 ส่งออกฟอร์ม PDX</h2>
        <p className="text-sm text-gray-500 mt-1">
          ส่งออกรายชื่อกำลังพลเป็นไฟล์ Excel ตามฟอร์มสำหรับ <b>นำเข้าระบบ PDX ของ ทบ.</b>
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">ขอบเขต (ทัพภาค)</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4A1A6B] outline-none">
              {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              เลือกหน่วย (เลือกได้หลายหน่วย)
              <span className="text-gray-400 font-normal"> · {loadingUnits ? "กำลังโหลด..." : `${units.length} หน่วย`}</span>
            </label>
            <input type="text" value={unitInput} list="unitlist"
              onChange={(e) => { setUnitInput(e.target.value); addUnit(e.target.value) }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUnit(unitInput) } }}
              placeholder="พิมพ์เพื่อค้นหา แล้วเลือกจากรายการ"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4A1A6B] outline-none" />
            <datalist id="unitlist">
              {units.filter((u) => !selected.includes(u)).map((u) => <option key={u} value={u} />)}
            </datalist>
          </div>
        </div>

        {/* หน่วยที่เลือก (chips) */}
        {selected.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.map((u) => (
              <span key={u} className="inline-flex items-center gap-1 bg-[#4A1A6B]/10 text-[#4A1A6B] text-xs font-medium px-2.5 py-1 rounded-full">
                {u}
                <button onClick={() => removeUnit(u)} className="hover:text-red-600 font-bold">×</button>
              </span>
            ))}
            <button onClick={() => setSelected([])} className="text-xs text-gray-400 hover:text-red-500 underline">ล้างทั้งหมด</button>
          </div>
        )}

        {/* พรีวิวจำนวน */}
        <div className="mt-4 bg-gray-50 rounded-lg px-4 py-3 text-sm">
          {loadingCount ? (
            <span className="text-gray-400">กำลังนับจำนวน...</span>
          ) : count ? (
            <span className="text-gray-700">
              จะส่งออก <b className="text-[#2D0F42] text-base">{count.count.toLocaleString()}</b> คน
              <span className="text-gray-400"> · </span>
              <span className="text-emerald-600">ผ่าน {count.passed.toLocaleString()}</span>
              <span className="text-gray-400"> · </span>
              <span className="text-red-500">ไม่ผ่าน {count.not_passed.toLocaleString()}</span>
              <span className="text-gray-400 block text-xs mt-0.5">
                ขอบเขต: {scopeText}{selected.length ? ` · ${selected.length} หน่วย` : " · ทุกหน่วย"}
              </span>
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={handleExport} disabled={loading || (count?.count ?? 0) === 0}
            className="bg-[#4A1A6B] hover:bg-[#3a1454] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            {loading ? "กำลังสร้างไฟล์..." : `⬇ ดาวน์โหลดไฟล์ PDX (${(count?.count ?? 0).toLocaleString()} คน)`}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">⚠️ {error}</p>}
        {done && <p className="mt-3 text-sm text-emerald-600">{done}</p>}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-gray-700 leading-relaxed">
        <h3 className="font-bold text-[#2D0F42] mb-2">📌 คำอธิบาย (สำหรับแอดมิน)</h3>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b>ไฟล์นี้คืออะไร:</b> รายชื่อกำลังพลพร้อมผลการศึกษา ในรูปแบบ 4 คอลัมน์ที่ระบบ <b>PDX</b> ของ ทบ. รับนำเข้าได้ทันที</li>
          <li><b>คอลัมน์ในไฟล์:</b> เลขบัตรประชาชน · ยศ ชื่อ-สกุล · สังกัด · ผลการศึกษา (ผ่าน/ไม่ผ่าน)</li>
          <li><b>ผลการศึกษา:</b> “ผ่าน” = ผ่านหลักสูตรที่กำหนดตามชั้นยศครบและใบรับรองยังไม่หมดอายุ · นอกนั้นเป็น “ไม่ผ่าน”</li>
          <li><b>เลือกหน่วย:</b> พิมพ์เพื่อค้นหาแล้ว <b>เลือกจากรายการที่ระบบแนะนำ</b> (หน่วยจริงในฐานข้อมูล) เลือกได้หลายหน่วย · เว้นว่าง = ทุกหน่วยในทัพภาคที่เลือก</li>
          <li><b>ตัวเลขพรีวิว:</b> ระบบจะบอกจำนวนคน (ผ่าน/ไม่ผ่าน) ที่จะส่งออก ก่อนกดดาวน์โหลด</li>
          <li><b>นำเข้า PDX:</b> เปิดระบบ PDX → เมนูนำเข้า → เลือกไฟล์ที่ดาวน์โหลดนี้ (ห้ามแก้หัวตาราง/ชื่อชีต)</li>
        </ul>
      </div>

      <div className="mt-5">
        <a href="/dashboard/reports" className="text-sm text-[#4A1A6B] hover:underline">← กลับหน้ารายงาน</a>
      </div>
    </div>
  )
}
