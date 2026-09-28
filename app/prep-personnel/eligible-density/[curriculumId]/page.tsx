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
import { Doughnut, Bar } from "react-chartjs-2"
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js"
import { api, EligibleDensityReport } from "@/lib/api"

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const UNIT_CHART_LIMIT = 10

const REGION_COLORS: Record<string, string> = {
  "1": "#4A1A6B",
  "2": "#8B5CF6",
  "3": "#F59E0B",
  "4": "#10B981",
  central: "#3B82F6",
  none: "#9CA3AF",
}

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
    const groups = new Map<string, { key: string; label: string; rows: typeof report.results }>()
    for (const row of report.results) {
      const key = row.army_region || "none"
      if (!groups.has(key)) groups.set(key, { key, label: row.army_region_display, rows: [] })
      groups.get(key)!.rows.push(row)
    }
    return Array.from(groups.values()).sort(
      (a, b) => b.rows.reduce((s, r) => s + r.eligible_count, 0) - a.rows.reduce((s, r) => s + r.eligible_count, 0)
    )
  }, [report])

  const regionChartData = useMemo(() => {
    const withCounts = grouped
      .map(g => ({ ...g, total: g.rows.reduce((s, r) => s + r.eligible_count, 0) }))
      .filter(g => g.total > 0)
    return withCounts
  }, [grouped])

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!report) return null

  const criteriaText = [
    report.eligible_rank_min_display || report.eligible_rank_max_display
      ? `ยศ ${report.eligible_rank_min_display || "ไม่จำกัด"} – ${report.eligible_rank_max_display || "ไม่จำกัด"}`
      : null,
    report.eligible_min_years_in_rank ? `ครองยศมาแล้วอย่างน้อย ${report.eligible_min_years_in_rank} ปี` : null,
    report.eligible_personnel_type_display,
    report.eligible_prerequisite_categories_display.length > 0
      ? `ต้องผ่านมาก่อน: ${report.eligible_prerequisite_categories_display.join(", ")}`
      : null,
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

      {!regionFilter && regionChartData.length > 1 && (
        <div className="bg-white rounded-xl border shadow-sm p-5 print:border-black print:shadow-none">
          <h2 className="font-semibold text-[#2D0F42] mb-1">ความคับคั่งแยกตามทัพภาค</h2>
          <p className="text-xs text-[#9a92a8] mb-4">คลิกที่ทัพภาคเพื่อดูรายละเอียดเป็นรายหน่วยด้านล่าง</p>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-56 h-56 shrink-0">
              <Doughnut
                data={{
                  labels: regionChartData.map(g => g.label),
                  datasets: [{
                    data: regionChartData.map(g => g.total),
                    backgroundColor: regionChartData.map(g => REGION_COLORS[g.key] || "#9CA3AF"),
                    borderWidth: 0,
                    hoverOffset: 6,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "65%",
                  plugins: { legend: { display: false } },
                  onClick: (_evt, elements) => {
                    const idx = elements[0]?.index
                    if (idx === undefined) return
                    const key = regionChartData[idx].key
                    setRegionFilter(key === "none" ? "none" : key)
                  },
                }}
              />
            </div>
            <div className="flex-1 w-full space-y-2 print:w-full">
              {regionChartData.map((g, i) => {
                const total = regionChartData.reduce((s, x) => s + x.total, 0)
                const pct = total > 0 ? Math.round((g.total / total) * 100) : 0
                return (
                  <button key={g.key} onClick={() => setRegionFilter(g.key)}
                    className="w-full flex items-center gap-3 text-left px-2 py-1.5 rounded-lg hover:bg-[#f7f5fa] print:hover:bg-white">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: REGION_COLORS[g.key] || "#9CA3AF" }} />
                    <span className="text-sm text-[#2D0F42] flex-1">
                      {i === 0 && <span className="text-amber-600 font-semibold mr-1">อันดับ 1</span>}
                      {g.label}
                    </span>
                    <span className="text-sm font-semibold text-[#4A1A6B]">{g.total} คน</span>
                    <span className="text-xs text-[#9a92a8] w-10 text-right">{pct}%</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

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
            {(() => {
              const withCounts = group.rows.filter(r => r.eligible_count > 0)
              if (withCounts.length < 2) return null
              const shown = withCounts.slice(0, UNIT_CHART_LIMIT)
              return (
                <div className="p-4 border-b print:hidden" style={{ height: `${Math.max(120, shown.length * 36)}px` }}>
                  <Bar
                    data={{
                      labels: shown.map(r => r.organization_name),
                      datasets: [{
                        data: shown.map(r => r.eligible_count),
                        backgroundColor: REGION_COLORS[group.key] || "#4A1A6B",
                        borderRadius: 4,
                        barThickness: 18,
                      }],
                    }}
                    options={{
                      indexAxis: "y",
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                        y: { ticks: { font: { size: 11 } } },
                      },
                    }}
                  />
                  {withCounts.length > UNIT_CHART_LIMIT && (
                    <p className="text-xs text-[#9a92a8] mt-1">แสดง {UNIT_CHART_LIMIT} หน่วยแรกที่เข้าเกณฑ์มากสุด — ดูครบทุกหน่วยในตารางด้านล่าง</p>
                  )}
                </div>
              )
            })()}
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
                {group.rows.map((r, i) => {
                  const maxInGroup = Math.max(...group.rows.map(x => x.eligible_count), 1)
                  return (
                  <tr key={r.organization_id ?? "none"} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa] print:hover:bg-white">
                    <td className="px-4 py-3 font-medium">
                      {i === 0 && r.eligible_count > 0 && <span className="text-amber-600 font-semibold mr-1.5">อันดับ 1</span>}
                      {r.organization_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#4A1A6B] w-8 shrink-0">{r.eligible_count}</span>
                        <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden print:hidden">
                          <div className="h-1.5 rounded-full bg-[#4A1A6B]" style={{ width: `${(r.eligible_count / maxInGroup) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-amber-600">{r.needs_verification_count || "—"}</td>
                    <td className="px-4 py-3 text-[#6b6478]">{r.total_in_scope}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
