/**
 * app/dashboard/reports/personnel/page.tsx
 * รายชื่อกำลังพลที่ผ่าน / ยังไม่ผ่านมาตรฐาน
 * รองรับ drill-down จากหน้า reports
 */
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { api, NotPassedPersonnel } from "@/lib/api"

const ARMY_REGION_OPTIONS = [
  { value: "", label: "ทุกทัพภาค" },
  { value: "1", label: "ทัพภาคที่ 1" },
  { value: "2", label: "ทัพภาคที่ 2" },
  { value: "3", label: "ทัพภาคที่ 3" },
  { value: "4", label: "ทัพภาคที่ 4" },
]

const RANK_CLASS_OPTIONS = [
  { value: "", label: "ทุกระดับชั้น" },
  { value: "nco", label: "นายทหารประทวน" },
  { value: "officer", label: "นายทหารสัญญาบัตร" },
  { value: "pvt", label: "พลทหาร" },
]

const RANK_OPTIONS = [
  { value: "", label: "ทุกยศ" },
  { value: "PVT", label: "พลทหาร" },
  { value: "CPL", label: "สิบตรี" },
  { value: "SGT3", label: "สิบโท" },
  { value: "SGT2", label: "สิบเอก" },
  { value: "SSGT", label: "จ่าสิบตรี" },
  { value: "MSGT", label: "จ่าสิบโท" },
  { value: "CSGT", label: "จ่าสิบเอก" },
  { value: "WO1", label: "พันจ่าตรี" },
  { value: "WO2", label: "พันจ่าโท" },
  { value: "WO3", label: "พันจ่าเอก" },
  { value: "2LT", label: "ร้อยตรี" },
  { value: "1LT", label: "ร้อยโท" },
  { value: "CPT", label: "ร้อยเอก" },
  { value: "MAJ", label: "พันตรี" },
  { value: "LTCOL", label: "พันโท" },
  { value: "COL", label: "พันเอก" },
  { value: "BGEN", label: "พลตรี" },
  { value: "MGEN", label: "พลโท" },
  { value: "GEN", label: "พลเอก" },
]

function PersonnelContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Status toggle: passed | not_passed
  const [status, setStatus] = useState<"passed" | "not_passed">(
    searchParams.get("status") === "passed" ? "passed" : "not_passed"
  )
  const [regionFilter, setRegionFilter] = useState(searchParams.get("army_region") ?? "")
  const [rankClassFilter, setRankClassFilter] = useState(searchParams.get("rank_class") ?? "")
  const [rankFilter, setRankFilter] = useState(searchParams.get("rank") ?? "")
  const [unitFilter, setUnitFilter] = useState(searchParams.get("unit") ?? "")
  const [searchText, setSearchText] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 20

  const [data, setData] = useState<NotPassedPersonnel[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = (p = page) => {
    setLoading(true)
    const params: Record<string, string> = {
      passed: status === "passed" ? "true" : "false",
      page: String(p),
      per_page: String(perPage),
    }
    if (regionFilter) params.army_region = regionFilter
    if (rankClassFilter) params.rank_class = rankClassFilter
    if (rankFilter) params.rank = rankFilter
    if (unitFilter) params.unit = unitFilter
    if (searchText.trim()) params.search = searchText.trim()

    api.complianceNotPassed(params)
      .then((r) => {
        setData(r.results)
        setTotalCount((r as any).total_count ?? r.count)
        setTotalPages((r as any).total_pages ?? 1)
      })
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1)
    load(1)
  }, [status, regionFilter, rankClassFilter, rankFilter, unitFilter, searchText]) // eslint-disable-line

  // Load when page changes (but not on filter change — handled above)
  useEffect(() => { load() }, [page]) // eslint-disable-line

  const isPassedMode = status === "passed"
  const title = isPassedMode ? "กำลังพลที่ผ่านมาตรฐาน" : "กำลังพลที่ยังไม่ผ่านมาตรฐาน"
  const subtitle = isPassedMode ? "รายชื่อผู้ผ่านมาตรฐานทุกหลักสูตรที่กำหนด" : "รายชื่อสำหรับจัดทำหนังสือติดตาม"

  const changePage = (p: number) => {
    if (p < 1 || p > totalPages) return
    setPage(p)
    window.scrollTo(0, 0)
  }

  const renderPageNumbers = () => {
    const pages: (number | "...")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push("...")
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
      if (page < totalPages - 2) pages.push("...")
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#2D0F42]">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <a href="/dashboard/reports" className="text-sm text-[#4A1A6B] hover:underline">← กลับหน้ารายงาน</a>
      </div>

      {/* Status Toggle */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setStatus("not_passed"); setPage(1) }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border-2 transition-colors ${
              status === "not_passed"
                ? "border-red-500 bg-red-500 text-white"
                : "border-red-200 text-red-600 hover:bg-red-50"
            }`}
          >
            ✗ ไม่ผ่านมาตรฐาน
          </button>
          <button
            onClick={() => { setStatus("passed"); setPage(1) }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border-2 transition-colors ${
              status === "passed"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            }`}
          >
            ✓ ผ่านมาตรฐาน
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={regionFilter}
            onChange={(e) => { setRegionFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
          >
            {ARMY_REGION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={rankClassFilter}
            onChange={(e) => { setRankClassFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
          >
            {RANK_CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={rankFilter}
            onChange={(e) => { setRankFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
          >
            {RANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            type="text"
            placeholder="ค้นหาหน่วย..."
            value={unitFilter}
            onChange={(e) => { setUnitFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] w-36"
          />
          <input
            type="text"
            placeholder="ค้นหาชื่อ-สกุล..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] min-w-[160px]"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {loading ? "กำลังโหลด..." : `พบ ${totalCount.toLocaleString()} ราย • หน้า ${page} จาก ${totalPages}`}
          </span>
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
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">ชื่อ-สกุล</th>
                  <th className="px-4 py-3">ยศ</th>
                  <th className="px-4 py-3">ระดับชั้น</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3">ทัพภาค</th>
                  {isPassedMode ? (
                    <th className="px-4 py-3">หลักสูตรที่ผ่าน</th>
                  ) : (
                    <>
                      <th className="px-4 py-3">หลักสูตรที่ขาด</th>
                      <th className="px-4 py-3">หมดอายุ</th>
                    </>
                  )}
                  <th className="px-4 py-3">ติดต่อ</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, idx) => (
                  <tr key={p.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * perPage + idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#2D0F42]">{p.full_name}</td>
                    <td className="px-4 py-3 text-gray-700">{p.rank_display || p.rank}</td>
                    <td className="px-4 py-3 text-gray-600">{p.rank_class_display}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.unit}{p.sub_unit ? <span className="text-gray-400 text-xs"> / {p.sub_unit}</span> : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.army_region_display || "-"}</td>
                    {isPassedMode ? (
                      <td className="px-4 py-3">
                        {(p as any).passed_courses?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(p as any).passed_courses.map((c: string) => (
                              <span key={c} className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                            ))}
                          </div>
                        ) : <span className="text-gray-400 text-xs">-</span>}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          {p.missing_courses.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.missing_courses.map((c) => (
                                <span key={c} className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                              ))}
                            </div>
                          ) : <span className="text-gray-400 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          {p.expired_courses.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.expired_courses.map((c) => (
                                <span key={c} className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                              ))}
                            </div>
                          ) : <span className="text-gray-400 text-xs">-</span>}
                        </td>
                      </>
                    )}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-gray-500">
              แสดง {(page - 1) * perPage + 1}–{Math.min(page * perPage, totalCount)} จาก {totalCount.toLocaleString()} รายการ
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => changePage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >«</button>
              <button
                onClick={() => changePage(page - 1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >‹</button>
              {renderPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`e${i}`} className="px-2 py-1 text-xs text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => changePage(p as number)}
                    className={`px-2.5 py-1 text-xs border rounded transition-colors ${
                      page === p
                        ? "border-[#4A1A6B] bg-[#4A1A6B] text-white"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >{p}</button>
                )
              )}
              <button
                onClick={() => changePage(page + 1)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >›</button>
              <button
                onClick={() => changePage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PersonnelPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-gray-400">กำลังโหลด...</div>}>
      <PersonnelContent />
    </Suspense>
  )
}
