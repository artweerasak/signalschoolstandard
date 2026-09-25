/**
 * app/dashboard/reports/summary-by-unit/page.tsx
 * รายงาน "ภาพรวมมาตรฐานกำลังพล แยกตามหน่วย" — ตารางนับจำนวน ผ่าน/ไม่ผ่าน ต่อหน่วย (พิมพ์ได้)
 * ต่างจากหน้า passed / not-passed ที่พิมพ์เป็น "รายชื่อรายบุคคล"
 * ใช้ endpoint เดิม: GET /military/api/v1/reports/compliance/by-unit/ (filter: army_region, rank_class)
 */
"use client"

import { useEffect, useState } from "react"
import { api, ComplianceByGroup } from "@/lib/api"

const ARMY_REGION_OPTIONS = [
  { value: "", label: "ทุกทัพภาค" },
  { value: "1", label: "ทัพภาคที่ 1" },
  { value: "2", label: "ทัพภาคที่ 2" },
  { value: "3", label: "ทัพภาคที่ 3" },
  { value: "4", label: "ทัพภาคที่ 4" },
  { value: "central", label: "ส่วนกลาง" },
]

const RANK_CLASS_OPTIONS = [
  { value: "", label: "ทุกระดับชั้น" },
  { value: "nco", label: "นายทหารประทวน" },
  { value: "officer", label: "นายทหารสัญญาบัตร" },
  { value: "pvt", label: "พลทหาร" },
  { value: "civilian", label: "ลูกจ้างประจำ" },
  { value: "government", label: "พนักงานราชการ" },
]

type SortKey = "unit" | "total" | "passed" | "not_passed" | "percent"

const c: React.CSSProperties = { border: "1px solid #333", padding: "4px 6px", textAlign: "center", verticalAlign: "middle" }
const cL: React.CSSProperties = { ...c, textAlign: "left" }

export default function SummaryByUnitPage() {
  const [data, setData] = useState<ComplianceByGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [regionFilter, setRegionFilter] = useState("")
  const [rankClassFilter, setRankClassFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("unit")
  const [printReady, setPrintReady] = useState(false)

  // รอ render พื้นที่พิมพ์เสร็จ แล้วค่อยเรียก window.print()
  useEffect(() => {
    if (!printReady) return
    const t = setTimeout(() => { window.print(); setPrintReady(false) }, 200)
    return () => clearTimeout(t)
  }, [printReady])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError("")
    const params: Record<string, string> = {}
    if (regionFilter) params.army_region = regionFilter
    if (rankClassFilter) params.rank_class = rankClassFilter
    ;(async () => {
      try {
        const res = await api.complianceByUnit(params)
        if (!cancelled) setData(Array.isArray(res) ? res : [])
      } catch {
        if (!cancelled) setError("ไม่สามารถโหลดข้อมูลได้")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [regionFilter, rankClassFilter])

  const rows = [...data].sort((a, b) => {
    switch (sortKey) {
      case "total":      return b.total - a.total
      case "passed":     return b.passed - a.passed
      case "not_passed": return b.not_passed - a.not_passed
      case "percent":    return (b.percent_passed ?? 0) - (a.percent_passed ?? 0)
      default:           return (a.label || "").localeCompare(b.label || "", "th")
    }
  })

  const sum = rows.reduce(
    (acc, r) => {
      acc.total += r.total; acc.passed += r.passed; acc.not_passed += r.not_passed
      acc.pending += (r.pending_approval ?? 0); acc.norq += (r.no_requirements ?? 0)
      return acc
    },
    { total: 0, passed: 0, not_passed: 0, pending: 0, norq: 0 },
  )
  const sumPct = sum.total > 0 ? (sum.passed / sum.total) * 100 : 0

  const regionLabel = ARMY_REGION_OPTIONS.find((o) => o.value === regionFilter)?.label || "ทุกทัพภาค"
  const rankClassLabel = RANK_CLASS_OPTIONS.find((o) => o.value === rankClassFilter)?.label || "ทุกระดับชั้น"
  const today = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })

  const pctColor = (p: number) => (p >= 80 ? "text-emerald-600" : p >= 60 ? "text-amber-600" : "text-red-600")

  return (
    <>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        @page { size: A4; margin: 14mm 12mm; }
      }`}</style>

      {/* ============ หน้าจอ ============ */}
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-[#2D0F42]">ภาพรวมมาตรฐานกำลังพล แยกตามหน่วย</h2>
            <p className="text-sm text-[#6b6478] mt-1">สรุปจำนวนผู้เข้ารับการทดสอบ ผ่าน/ไม่ผ่าน ของแต่ละหน่วย (สำหรับพิมพ์ภาพรวม)</p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setPrintReady(true)}
              disabled={loading || rows.length === 0 || printReady}
              className="bg-[#4A1A6B] hover:bg-[#3a1456] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
            >🖨️ {printReady ? "กำลังเตรียมพิมพ์..." : "พิมพ์รายงานภาพรวม"}</button>
            <a href="/dashboard/reports" className="text-sm text-[#4A1A6B] hover:underline">← กลับหน้ารายงาน</a>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#f0ecf6] flex flex-wrap gap-3 items-center">
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
            {ARMY_REGION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={rankClassFilter} onChange={(e) => setRankClassFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
            {RANK_CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
            <option value="unit">เรียงตามชื่อหน่วย</option>
            <option value="total">เรียงตามจำนวนมากสุด</option>
            <option value="not_passed">เรียงตามไม่ผ่านมากสุด</option>
            <option value="percent">เรียงตาม %ผ่านสูงสุด</option>
          </select>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0ecf6] text-sm font-medium text-[#4a4456]">
            {loading ? "กำลังโหลด..." : `${rows.length} หน่วย · กำลังพลรวม ${sum.total.toLocaleString()} นาย · ผ่าน ${sum.passed.toLocaleString()} · ไม่ผ่าน ${sum.not_passed.toLocaleString()} (${sumPct.toFixed(1)}%)`}
          </div>
          {loading ? (
            <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-[#9a92a8]">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-xs text-[#6b6478] uppercase">
                    <th className="px-4 py-3 text-center w-14">ลำดับ</th>
                    <th className="px-4 py-3 text-left">หน่วย</th>
                    <th className="px-4 py-3 text-center">กำลังพล (นาย)</th>
                    <th className="px-4 py-3 text-center">ผ่าน</th>
                    <th className="px-4 py-3 text-center">ไม่ผ่าน</th>
                    <th className="px-4 py-3 text-center">รออนุมัติ</th>
                    <th className="px-4 py-3 text-center">% ผ่าน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key || i} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                      <td className="px-4 py-2.5 text-center text-[#9a92a8]">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-[#2D0F42]">{r.label || "ไม่ระบุหน่วย"}</td>
                      <td className="px-4 py-2.5 text-center text-[#4a4456]">{r.total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center text-emerald-600 font-medium">{r.passed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center text-red-600 font-medium">{r.not_passed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center text-amber-600">{(r.pending_approval ?? 0).toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-center font-bold ${pctColor(r.percent_passed ?? 0)}`}>{(r.percent_passed ?? 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-[#f7f5fa] font-bold text-[#2D0F42]">
                    <td className="px-4 py-3 text-center" colSpan={2}>รวมทั้งสิ้น</td>
                    <td className="px-4 py-3 text-center">{sum.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-emerald-700">{sum.passed.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-red-700">{sum.not_passed.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-amber-700">{sum.pending.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-center ${pctColor(sumPct)}`}>{sumPct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-[#9a92a8]">
          หมายเหตุ: &quot;ไม่ผ่าน&quot; นับรวมผู้ที่ยังไม่ได้สอบ และผู้ที่สอบผ่านคะแนนแล้วแต่ยังรออนุมัติใบประกาศ (คอลัมน์ &quot;รออนุมัติ&quot; เป็นส่วนย่อยของไม่ผ่าน)
        </p>
      </div>

      {/* ============ พื้นที่พิมพ์ A4 (สร้างเฉพาะตอนกดพิมพ์) ============ */}
      {printReady && (
        <div className="print-area hidden print:block" style={{ padding: "4px 6px", fontFamily: "'IBM Plex Sans Thai','Sarabun',sans-serif", color: "#111" }}>
          <h3 style={{ fontWeight: "bold", fontSize: "16px", textAlign: "center", margin: "0 0 2px" }}>รายงานภาพรวมมาตรฐานกำลังพล แยกตามหน่วย</h3>
          <p style={{ fontSize: "12px", textAlign: "center", margin: "0 0 10px" }}>
            ทัพภาค: {regionLabel} &nbsp;·&nbsp; ระดับชั้น: {rankClassLabel} &nbsp;·&nbsp; จำนวน {rows.length} หน่วย &nbsp;·&nbsp; ณ วันที่ {today}
          </p>
          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#eee" }}>
                <th style={{ ...c, width: "44px" }}>ลำดับ</th>
                <th style={cL}>หน่วย</th>
                <th style={{ ...c, width: "90px" }}>กำลังพล (นาย)</th>
                <th style={{ ...c, width: "70px" }}>ผ่าน</th>
                <th style={{ ...c, width: "70px" }}>ไม่ผ่าน</th>
                <th style={{ ...c, width: "70px" }}>รออนุมัติ</th>
                <th style={{ ...c, width: "70px" }}>% ผ่าน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key || i}>
                  <td style={{ ...c }}>{i + 1}</td>
                  <td style={cL}>{r.label || "ไม่ระบุหน่วย"}</td>
                  <td style={c}>{r.total.toLocaleString()}</td>
                  <td style={c}>{r.passed.toLocaleString()}</td>
                  <td style={c}>{r.not_passed.toLocaleString()}</td>
                  <td style={c}>{(r.pending_approval ?? 0).toLocaleString()}</td>
                  <td style={c}>{(r.percent_passed ?? 0).toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{ background: "#eee", fontWeight: "bold" }}>
                <td style={c} colSpan={2}>รวมทั้งสิ้น</td>
                <td style={c}>{sum.total.toLocaleString()}</td>
                <td style={c}>{sum.passed.toLocaleString()}</td>
                <td style={c}>{sum.not_passed.toLocaleString()}</td>
                <td style={c}>{sum.pending.toLocaleString()}</td>
                <td style={c}>{sumPct.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: "10px", marginTop: "8px", color: "#555" }}>
            หมายเหตุ: &quot;ไม่ผ่าน&quot; นับรวมผู้ที่ยังไม่ได้สอบ และผู้ที่สอบผ่านแล้วแต่ยังรออนุมัติใบประกาศ
          </p>
        </div>
      )}
    </>
  )
}
