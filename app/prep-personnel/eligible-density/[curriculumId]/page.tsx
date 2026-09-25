/**
 * app/prep-personnel/eligible-density/[curriculumId]/page.tsx
 * จำนวนกำลังพลที่ "เข้าเกณฑ์" หลักสูตรนี้ แยกตามหน่วย ใช้ประกอบการตัดสินใจ
 * แบ่งโควตาให้แต่ละหน่วย (ก่อนตัดสินใจ) — คนละรายงานกับ quota-report ที่ดู
 * ยอดขอ/บรรจุจริงหลังตัดสินใจแบ่งโควตาไปแล้ว มีปุ่มพิมพ์สำหรับเอาไปประกอบ
 * การประชุม — เลือกกรองเฉพาะทัพภาค/ส่วนกลางได้ และจัดกลุ่มตามทัพภาคในตาราง
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, EligibleDensityReport } from "@/lib/api"

const REGION_OPTIONS = [
  { value: "", label: "ทุกทัพภาค" },
  { value: "1", label: "กองทัพภาคที่ 1" },
  { value: "2", label: "กองทัพภาคที่ 2" },
  { value: "3", label: "กองทัพภาคที่ 3" },
  { value: "4", label: "กองทัพภาคที่ 4" },
  { value: "central", label: "ส่วนกลาง" },
  { value: "none", label: "ไม่ระบุ" },
]

export default function EligibleDensityReportPage() {
  const params = useParams()
  const curriculumId = Number(params.curriculumId)
  const [report, setReport] = useState<EligibleDensityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [regionFilter, setRegionFilter] = useState("")

  useEffect(() => {
    if (!curriculumId) return
    setLoading(true)
    api.getEligibleDensityReport(curriculumId, regionFilter || undefined)
      .then(setReport)
      .catch(() => setError("ไม่สามารถโหลดรายงานได้"))
      .finally(() => setLoading(false))
  }, [curriculumId, regionFilter])

  const grouped = useMemo(() => {
    if (!report) return []
    const groups = new Map<string, { label: string; rows: typeof report.results }>()
    for (const row of report.results) {
      const key = row.army_region || "none"
      if (!groups.has(key)) groups.set(key, { label: row.army_region_display, rows: [] })
      groups.get(key)!.rows.push(row)
    }
    return Array.from(groups.values())
  }, [report])

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!report) return null

  const criteriaText = [
    report.eligible_rank_min_display || report.eligible_rank_max_display
      ? `ยศ ${report.eligible_rank_min_display || "ไม่จำกัด"} – ${report.eligible_rank_max_display || "ไม่จำกัด"}`
      : null,
    report.eligible_min_years_in_rank ? `ครองยศมาแล้วอย่างน้อย ${report.eligible_min_years_in_rank} ปี` : null,
    report.eligible_personnel_type_display,
  ].filter(Boolean).join(" · ") || "ไม่ได้กำหนดเกณฑ์คุณสมบัติไว้ (นับกำลังพลทุกคน)"

  return (
    <div className="p-6 space-y-6 print:p-0">
      <div className="print:hidden flex items-start justify-between gap-4">
        <div>
          <Link href="/prep-personnel" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
          <h1 className="text-2xl font-bold text-[#4A1A6B] mt-2">รายงานจำนวนผู้มีสิทธิ์เข้าเรียน</h1>
          <p className="text-sm text-[#6b6478] mt-1">{report.curriculum_name} — ใช้ประกอบการพิจารณาแบ่งโควตาให้แต่ละหน่วย ก่อนตัดสินใจ</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
            {REGION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => window.print()}
            className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg">
            🖨️ พิมพ์รายงาน
          </button>
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">รายงานจำนวนผู้มีสิทธิ์เข้าเรียน — {report.curriculum_name}</h1>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 print:border-black print:shadow-none">
        <p className="text-xs text-[#9a92a8] mb-1">เกณฑ์คุณสมบัติของหลักสูตรนี้</p>
        <p className="text-sm font-medium text-[#2D0F42]">{criteriaText}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-5 text-center print:border-black print:shadow-none">
          <p className="text-3xl font-bold text-[#4A1A6B]">{report.national.eligible_count}</p>
          <p className="text-xs text-[#6b6478] mt-1">เข้าเกณฑ์ (ในขอบเขตที่เลือก)</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5 text-center print:border-black print:shadow-none">
          <p className="text-3xl font-bold text-amber-600">{report.national.needs_verification_count}</p>
          <p className="text-xs text-[#6b6478] mt-1">ยศตรงเกณฑ์ แต่ยังไม่มีวันที่แต่งตั้งยศ (ตรวจสอบไม่ได้)</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5 text-center print:border-black print:shadow-none">
          <p className="text-3xl font-bold text-[#2D0F42]">{report.national.total_in_scope}</p>
          <p className="text-xs text-[#6b6478] mt-1">รวมยศ/ประเภทตรงเกณฑ์</p>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] py-12 text-center text-[#9a92a8] text-sm">
          ไม่พบกำลังพลที่ตรงเกณฑ์เลย
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.label} className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden print:border-black print:shadow-none">
            <div className="p-4 border-b bg-[#f7f5fa] print:bg-white">
              <h2 className="font-semibold text-[#2D0F42]">
                {group.label} <span className="text-[#9a92a8] font-normal text-sm">(เข้าเกณฑ์รวม {group.rows.reduce((s, r) => s + r.eligible_count, 0)} คน)</span>
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e6e1ee] text-left text-xs text-[#6b6478] uppercase">
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3">เข้าเกณฑ์</th>
                  <th className="px-4 py-3">ยังตรวจสอบไม่ได้</th>
                  <th className="px-4 py-3">รวมยศ/ประเภทตรงเกณฑ์</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(r => (
                  <tr key={r.organization_id ?? "none"} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa] print:hover:bg-white">
                    <td className="px-4 py-3 font-medium">{r.organization_name}</td>
                    <td className="px-4 py-3 font-semibold text-[#4A1A6B]">{r.eligible_count}</td>
                    <td className="px-4 py-3 text-amber-600">{r.needs_verification_count || "—"}</td>
                    <td className="px-4 py-3 text-[#6b6478]">{r.total_in_scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
