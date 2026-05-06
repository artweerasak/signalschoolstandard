/**
 * app/dashboard/reports/not-passed/page.tsx
 * รายชื่อกำลังพลที่ยังไม่ผ่านมาตรฐาน
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
]

const RANK_CLASS_OPTIONS = [
  { value: "", label: "ทุกระดับชั้น" },
  { value: "nco", label: "นายทหารประทวน" },
  { value: "officer", label: "นายทหารสัญญาบัตร" },
  { value: "pvt", label: "พลทหาร" },
]

export default function NotPassedPage() {
  const [data, setData] = useState<NotPassedPersonnel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [regionFilter, setRegionFilter] = useState("")
  const [rankClassFilter, setRankClassFilter] = useState("")
  const [unitFilter, setUnitFilter] = useState("")
  const [searchText, setSearchText] = useState("")

  const load = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (regionFilter) params.army_region = regionFilter
    if (rankClassFilter) params.rank_class = rankClassFilter
    if (unitFilter) params.unit = unitFilter
    if (searchText.trim()) params.search = searchText.trim()
    api.complianceNotPassed(params)
      .then((r) => setData(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [regionFilter, rankClassFilter, unitFilter, searchText])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D0F42]">กำลังพลที่ยังไม่ผ่านมาตรฐาน</h2>
          <p className="text-sm text-gray-500 mt-1">รายชื่อสำหรับจัดทำหนังสือติดตาม</p>
        </div>
        <a href="/dashboard/reports" className="text-sm text-[#4A1A6B] hover:underline">← กลับหน้ารายงาน</a>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3">
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
        >
          {ARMY_REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={rankClassFilter}
          onChange={(e) => setRankClassFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
        >
          {RANK_CLASS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="ค้นหาหน่วย..."
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
        />
        <input
          type="text"
          placeholder="ค้นหาชื่อ-สกุล..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] min-w-44"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {loading ? "กำลังโหลด..." : `พบ ${data.length.toLocaleString()} ราย`}
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
                  <th className="px-4 py-3">ชื่อ-สกุล</th>
                  <th className="px-4 py-3">ยศ</th>
                  <th className="px-4 py-3">ระดับชั้น</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3">ทัพภาค</th>
                  <th className="px-4 py-3">หลักสูตรที่ขาด</th>
                  <th className="px-4 py-3">หมดอายุ</th>
                  <th className="px-4 py-3">ติดต่อ</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#2D0F42]">{p.full_name}</td>
                    <td className="px-4 py-3 text-gray-700">{p.rank_display || p.rank}</td>
                    <td className="px-4 py-3 text-gray-600">{p.rank_class_display}</td>
                    <td className="px-4 py-3 text-gray-600">{p.unit}{p.sub_unit ? ` / ${p.sub_unit}` : ""}</td>
                    <td className="px-4 py-3 text-gray-600">{p.army_region_display || "-"}</td>
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
      </div>
    </div>
  )
}
