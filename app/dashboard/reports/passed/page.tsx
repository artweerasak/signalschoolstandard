/**
 * app/dashboard/reports/passed/page.tsx
 * รายชื่อกำลังพลที่ "ผ่านมาตรฐาน" (มีใบประกาศครบตามที่กำหนด) — พิมพ์แยกตามหน่วย / เฉพาะหน่วย
 */
"use client"

import { useEffect, useState } from "react"
import { api, NotPassedPersonnel } from "@/lib/api"

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

const cell: React.CSSProperties = { border: "1px solid #333", padding: "3px 6px", textAlign: "left", verticalAlign: "top" }

export default function PassedPage() {
  const [data, setData] = useState<NotPassedPersonnel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [regionFilter, setRegionFilter] = useState("")
  const [rankClassFilter, setRankClassFilter] = useState("")
  const [unitFilter, setUnitFilter] = useState("")
  const [searchText, setSearchText] = useState("")
  const [printUnit, setPrintUnit] = useState("")   // "" = พิมพ์ทุกหน่วย, ไม่ว่าง = เฉพาะหน่วยนั้น
  const [printReady, setPrintReady] = useState(false)  // สร้าง DOM พิมพ์เฉพาะตอนกดพิมพ์ (กันจอค้างจากหลายพันแถว)
  const [page, setPage] = useState(1)
  const PER_PAGE = 100

  // พร้อมพิมพ์ → รอ render print-area เสร็จ แล้วค่อยเรียก window.print()
  useEffect(() => {
    if (!printReady) return
    const t = setTimeout(() => { window.print(); setPrintReady(false) }, 200)
    return () => clearTimeout(t)
  }, [printReady])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(""); setPage(1)
    // passed=true → รายชื่อผู้ผ่านมาตรฐาน (endpoint เดียวกับ not-passed)
    const params: Record<string, string> = { per_page: "10000", passed: "true" }
    if (regionFilter) params.army_region = regionFilter
    if (rankClassFilter) params.rank_class = rankClassFilter
    if (unitFilter) params.unit = unitFilter
    if (searchText.trim()) params.search = searchText.trim()
    ;(async () => {
      try {
        // per_page=10000 คืนครบในครั้งเดียว — ไม่ต้องวนหน้า (กันยิงซ้ำหลายรอบ)
        const first = await api.complianceNotPassed({ ...params, page: "1" })
        if (!cancelled) setData(first.results)
      } catch {
        if (!cancelled) setError("ไม่สามารถโหลดข้อมูลได้")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [regionFilter, rankClassFilter, unitFilter, searchText])

  const byUnit: Record<string, NotPassedPersonnel[]> = {}
  for (const p of data) {
    const u = p.unit || "ไม่ระบุหน่วย"
    if (!byUnit[u]) byUnit[u] = []
    byUnit[u].push(p)
  }
  const units = Object.keys(byUnit).sort((a, b) => a.localeCompare(b, "th"))
  const totalPages = Math.max(1, Math.ceil(data.length / PER_PAGE))
  const pageRows = data.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        .unit-page { page-break-after: always; }
        .unit-page:last-child { page-break-after: auto; }
      }`}</style>

      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#2D0F42]">กำลังพลที่ผ่านมาตรฐาน</h2>
            <p className="text-sm text-gray-500 mt-1">ผ่านมาตรฐานหลักสูตรที่กำหนดครบแล้ว (มีใบประกาศ) — สำหรับจัดทำบัญชีรายชื่อ</p>
          </div>
          <div className="flex gap-3 items-center">
            <select value={printUnit} onChange={(e) => setPrintUnit(e.target.value)}
              disabled={loading || data.length === 0}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] max-w-56">
              <option value="">พิมพ์ทุกหน่วย (แยกหน้า)</option>
              {units.map((u) => <option key={u} value={u}>{u} ({byUnit[u].length})</option>)}
            </select>
            <button
              onClick={() => setPrintReady(true)}
              disabled={loading || data.length === 0 || printReady}
              className="bg-[#4A1A6B] hover:bg-[#3a1456] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
            >🖨️ {printReady ? "กำลังเตรียมพิมพ์..." : (printUnit ? "พิมพ์เฉพาะหน่วยนี้" : "พิมพ์แยกตามหน่วย")}</button>
            <a href="/dashboard/reports" className="text-sm text-[#4A1A6B] hover:underline">← กลับหน้ารายงาน</a>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3">
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
            {ARMY_REGION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={rankClassFilter} onChange={(e) => setRankClassFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
            {RANK_CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="text" placeholder="ค้นหาหน่วย..." value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          <input type="text" placeholder="ค้นหาชื่อ-สกุล..." value={searchText} onChange={(e) => setSearchText(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] min-w-44" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 text-sm font-medium text-gray-700">
            {loading ? "กำลังโหลด..." : `พบ ${data.length.toLocaleString()} ราย · ${units.length} หน่วย · หน้า ${page}/${totalPages}`}
          </div>
          {loading ? (
            <div className="py-16 text-center text-gray-400">กำลังโหลด...</div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center text-gray-400">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">ชื่อ-สกุล</th>
                    <th className="px-4 py-3">ยศ</th>
                    <th className="px-4 py-3">ระดับชั้น</th>
                    <th className="px-4 py-3">หน่วย</th>
                    <th className="px-4 py-3">ทัพภาค</th>
                    <th className="px-4 py-3">หลักสูตรที่ผ่าน</th>
                    <th className="px-4 py-3">ติดต่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-[#2D0F42]">{p.full_name}</td>
                      <td className="px-4 py-3 text-gray-700">{p.rank_display || p.rank}</td>
                      <td className="px-4 py-3 text-gray-600">{p.rank_class_display}</td>
                      <td className="px-4 py-3 text-gray-600">{p.unit}{p.sub_unit ? ` / ${p.sub_unit}` : ""}</td>
                      <td className="px-4 py-3 text-gray-600">{p.army_region_display || "-"}</td>
                      <td className="px-4 py-3">
                        {p.passed_courses.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.passed_courses.map((c) => (
                              <span key={c} className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                            ))}
                          </div>
                        ) : <span className="text-gray-400 text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.contact_email && <div>{p.contact_email}</div>}
                        {p.phone_number && <div>{p.phone_number}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && data.length > PER_PAGE && (
            <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">◀ ก่อนหน้า</button>
              <span className="text-sm text-gray-600">หน้า {page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">ถัดไป ▶</button>
            </div>
          )}
        </div>
      </div>

      {/* ===== พื้นที่พิมพ์ — สร้างเฉพาะตอนกดพิมพ์ (กันจอค้างจากหลายพันแถว) ===== */}
      {printReady && (
      <div className="print-area hidden print:block">
        {(printUnit && byUnit[printUnit] ? [printUnit] : units).map((u) => (
          <div key={u} className="unit-page" style={{ padding: "12px 20px" }}>
            <h3 style={{ fontWeight: "bold", fontSize: "15px", marginBottom: "2px" }}>บัญชีรายชื่อกำลังพลที่ผ่านมาตรฐาน</h3>
            <p style={{ fontSize: "13px", margin: "0 0 8px" }}>หน่วย: {u} &nbsp;·&nbsp; จำนวน {byUnit[u].length} นาย</p>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...cell, width: "40px" }}>ลำดับ</th>
                  <th style={cell}>ยศ ชื่อ-สกุล</th>
                  <th style={{ ...cell, width: "120px" }}>ระดับชั้น</th>
                  <th style={cell}>หลักสูตรที่ผ่าน</th>
                  <th style={{ ...cell, width: "120px" }}>ติดต่อ</th>
                </tr>
              </thead>
              <tbody>
                {byUnit[u].map((p, i) => (
                  <tr key={p.user_id}>
                    <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                    <td style={cell}>{p.full_name}</td>
                    <td style={cell}>{p.rank_class_display}</td>
                    <td style={cell}>{p.passed_courses.join(", ")}</td>
                    <td style={cell}>{p.phone_number || p.contact_email || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      )}
    </>
  )
}
