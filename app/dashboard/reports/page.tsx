/**
 * app/dashboard/reports/page.tsx
 * รายงานมาตรฐานกำลังพล
 */
"use client"

import { useEffect, useState } from "react"
import { api, ComplianceOverview, ComplianceByGroup } from "@/lib/api"

type TabKey = "overview" | "region" | "rank_class" | "rank" | "unit"

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "ภาพรวม" },
  { key: "region", label: "แยกตามทัพภาค" },
  { key: "rank_class", label: "แยกตามระดับชั้น" },
  { key: "rank", label: "แยกตามยศ" },
  { key: "unit", label: "แยกตามหน่วย" },
]

function ProgressBar({ percent }: { percent: number }) {
  const color = percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-400" : "bg-red-500"
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div className={`${color} h-2.5 rounded-full`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}

function GroupTable({ data, loading }: { data: ComplianceByGroup[]; loading: boolean }) {
  if (loading) return <div className="py-10 text-center text-gray-400">กำลังโหลด...</div>
  if (!data.length) return <div className="py-10 text-center text-gray-400">ไม่มีข้อมูล</div>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase">
          <th className="pb-3 pr-4">กลุ่ม</th>
          <th className="pb-3 pr-4 text-right">ทั้งหมด</th>
          <th className="pb-3 pr-4 text-right">ผ่าน</th>
          <th className="pb-3 pr-4 text-right">ไม่ผ่าน</th>
          <th className="pb-3 w-44">% ผ่าน</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-3 pr-4 font-medium text-[#2D0F42]">{row.label}</td>
            <td className="py-3 pr-4 text-right">{row.total.toLocaleString()}</td>
            <td className="py-3 pr-4 text-right text-emerald-700 font-semibold">{row.passed.toLocaleString()}</td>
            <td className="py-3 pr-4 text-right text-red-600 font-semibold">{row.not_passed.toLocaleString()}</td>
            <td className="py-3">
              <div className="flex items-center gap-2">
                <ProgressBar percent={row.percent_passed} />
                <span className="text-xs font-semibold w-10 text-right">{row.percent_passed.toFixed(1)}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>("overview")
  const [overview, setOverview] = useState<ComplianceOverview | null>(null)
  const [groupData, setGroupData] = useState<ComplianceByGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api.complianceOverview().then(setOverview).catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
  }, [])

  useEffect(() => {
    if (tab === "overview") return
    setLoading(true)
    setGroupData([])
    const callMap: Record<TabKey, () => Promise<ComplianceByGroup[]>> = {
      overview: () => Promise.resolve([]),
      region: () => api.complianceByRegion(),
      rank_class: () => api.complianceByRankClass(),
      rank: () => api.complianceByRank(),
      unit: () => api.complianceByUnit(),
    }
    callMap[tab]()
      .then(setGroupData)
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }, [tab])

  const passRate = overview ? overview.percent_passed : 0
  const passColor = passRate >= 80 ? "text-emerald-600" : passRate >= 50 ? "text-amber-500" : "text-red-600"
  const barColor = passRate >= 80 ? "bg-emerald-500" : passRate >= 50 ? "bg-amber-400" : "bg-red-500"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D0F42]">รายงานมาตรฐานกำลังพล</h2>
          <p className="text-sm text-gray-500 mt-1">สถานะการผ่านมาตรฐานหลักสูตรที่กำหนด</p>
        </div>
        <a
          href="/dashboard/reports/not-passed"
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          📋 ดูรายชื่อที่ยังไม่ผ่าน
        </a>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "กำลังพลทั้งหมด", value: overview.total.toLocaleString(), color: "text-[#2D0F42]" },
            { label: "ผ่านมาตรฐาน", value: overview.passed.toLocaleString(), color: "text-emerald-600" },
            { label: "ยังไม่ผ่าน", value: overview.not_passed.toLocaleString(), color: "text-red-600" },
            { label: "อัตราผ่าน", value: `${passRate.toFixed(1)}%`, color: passColor },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {overview && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between text-sm mb-3">
            <span className="font-semibold text-gray-700">ภาพรวมอัตราผ่านมาตรฐาน</span>
            <span className={`font-bold ${passColor}`}>{passRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div className={`h-4 rounded-full ${barColor}`} style={{ width: `${Math.min(passRate, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>ผ่าน {overview.passed.toLocaleString()} คน</span>
            <span>ไม่ผ่าน {overview.not_passed.toLocaleString()} คน</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-200 px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-[#4A1A6B] text-[#4A1A6B]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === "overview" ? (
            <p className="text-sm text-gray-500 py-6 text-center">เลือกแท็บด้านบนเพื่อดูรายงานแยกตามกลุ่ม</p>
          ) : (
            <GroupTable data={groupData} loading={loading} />
          )}
        </div>
      </div>
    </div>
  )
}
