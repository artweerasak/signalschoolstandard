/**
 * app/dashboard/reports/page.tsx
 */
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api, ComplianceOverview, ComplianceByGroup } from "@/lib/api"
import dynamic from "next/dynamic"

// Load chart wrapper only on client — avoids SSR crash
const ChartBox = dynamic(() => import("./_charts"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-300 text-sm">กำลังโหลดกราฟ...</div>
  ),
})

type TabKey = "overview" | "region" | "rank_class" | "rank" | "unit"

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "overview",   label: "ภาพรวม",         icon: "🏠" },
  { key: "region",     label: "แยกตามทัพภาค",    icon: "🗺️" },
  { key: "rank_class", label: "แยกตามระดับชั้น", icon: "🎓" },
  { key: "rank",       label: "แยกตามยศ",        icon: "⭐" },
  { key: "unit",       label: "แยกตามหน่วย",     icon: "🏢" },
]

const TAB_CALL: Record<TabKey, (() => Promise<ComplianceByGroup[]>) | null> = {
  overview:   null,
  region:     () => api.complianceByRegion(),
  rank_class: () => api.complianceByRankClass(),
  rank:       () => api.complianceByRank(),
  unit:       () => api.complianceByUnit(),
}

function ProgressRow({ item }: { item: ComplianceByGroup }) {
  const pct = item.total > 0 ? (item.passed / item.total) * 100 : 0
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-500"
  const textColor = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-600"
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700 w-36 truncate shrink-0" title={item.label}>{item.label}</span>
      <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct,100)}%` }} />
      </div>
      <span className={`text-sm font-bold w-14 text-right ${textColor}`}>{pct.toFixed(1)}%</span>
      <span className="text-xs text-gray-400 w-20 text-right">{item.passed}/{item.total}</span>
    </div>
  )
}

export default function ReportsPage() {
  const router = useRouter()
  const [tab, setTab]                             = useState<TabKey>("overview")
  const [overview, setOverview]                   = useState<ComplianceOverview | null>(null)
  const [groupData, setGroupData]                 = useState<ComplianceByGroup[]>([])
  const [loadingOverview, setLoadingOverview]     = useState(true)
  const [loadingGroup, setLoadingGroup]           = useState(false)
  const [error, setError]                         = useState("")
  const [groupError, setGroupError]               = useState("")

  // Load overview on mount
  useEffect(() => {
    api.complianceOverview()
      .then(setOverview)
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") router.replace("/login")
        else setError("ไม่สามารถโหลดข้อมูลได้")
      })
      .finally(() => setLoadingOverview(false))
  }, [router])

  // Load group data when non-overview tab selected
  useEffect(() => {
    const fn = TAB_CALL[tab]
    if (!fn) return
    setError("")
    setLoadingGroup(true)
    setGroupData([])
    setGroupError("")
    fn()
      .then((result) => setGroupData(Array.isArray(result) ? result : []))
      .catch((err) => setGroupError(err.message === "UNAUTHORIZED" ? "กรุณาเข้าสู่ระบบใหม่" : "โหลดข้อมูลไม่สำเร็จ: " + err.message))
      .finally(() => setLoadingGroup(false))
  }, [tab])

  const passRate  = overview?.percent_passed ?? 0
  const passColor = passRate >= 80 ? "text-emerald-600" : passRate >= 50 ? "text-amber-500" : "text-red-600"
  const barColor  = passRate >= 80 ? "bg-emerald-500" : passRate >= 50 ? "bg-amber-400" : "bg-red-500"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#2D0F42]">รายงานมาตรฐานกำลังพล</h2>
          <p className="text-sm text-gray-500 mt-1">สถานะการผ่านมาตรฐานหลักสูตรที่กำหนด</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/dashboard/reports/personnel?status=passed"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            ✅ ดูผู้ผ่านทั้งหมด
          </a>
          <a href="/dashboard/reports/personnel?status=not_passed"
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            📋 ดูผู้ไม่ผ่านทั้งหมด
          </a>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
      )}

      {/* Summary Cards */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse h-24" />
          ))}
        </div>
      ) : overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "กำลังพลทั้งหมด", value: overview.total.toLocaleString(),       color: "text-[#2D0F42]",    bg: "bg-white",      icon: "👥" },
            { label: "ผ่านมาตรฐาน",    value: overview.passed.toLocaleString(),      color: "text-emerald-600", bg: "bg-emerald-50", icon: "✅" },
            { label: "ยังไม่ผ่าน",     value: overview.not_passed.toLocaleString(), color: "text-red-600",     bg: "bg-red-50",     icon: "❌" },
            { label: "อัตราผ่าน",      value: `${passRate.toFixed(1)}%`,            color: passColor,          bg: "bg-white",      icon: "📊" },
          ].map((c) => (
            <div key={c.label} className={`${c.bg} rounded-xl p-5 shadow-sm border border-gray-100`}>
              <span className="text-2xl">{c.icon}</span>
              <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-200 px-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.key ? "border-[#4A1A6B] text-[#4A1A6B]" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ─── แท็บภาพรวม ─── */}
          {tab === "overview" && (
            overview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Donut */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-4">สัดส่วนผ่าน / ไม่ผ่าน</p>
                  <div style={{ height: 260, position: "relative" }}>
                    <ChartBox type="donut" passed={overview.passed} notPassed={overview.not_passed} data={[]} />
                  </div>
                </div>
                {/* Progress bar */}
                <div className="flex flex-col justify-center gap-4">
                  <p className="text-sm font-semibold text-gray-700">ภาพรวมอัตราผ่านมาตรฐาน</p>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500">อัตราผ่าน</span>
                      <span className={`font-bold text-lg ${passColor}`}>{passRate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div className={`h-6 rounded-full ${barColor} flex items-center justify-end pr-2`}
                        style={{ width: `${Math.min(passRate,100)}%` }}>
                        <span className="text-white text-xs font-bold">{passRate.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs mt-2">
                      <span className="text-emerald-600 font-semibold">✓ ผ่าน {overview.passed} คน</span>
                      <span className="text-red-500 font-semibold">✗ ไม่ผ่าน {overview.not_passed} คน</span>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    🎯 เป้าหมาย ≥ 80% {passRate >= 80 ? "· ✅ บรรลุเป้าหมาย" : `· ⚠️ ต่ำกว่าเป้า ${(80-passRate).toFixed(1)}%`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
            )
          )}

          {/* ─── แท็บกลุ่ม ─── */}
          {tab !== "overview" && (
            loadingGroup ? (
              <div className="py-12 text-center text-gray-400">
                <div className="inline-block w-8 h-8 border-4 border-[#4A1A6B] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">กำลังโหลด...</p>
              </div>
            ) : groupError ? (
              <div className="py-12 text-center">
                <p className="text-red-500 text-sm font-medium mb-2">⚠️ {groupError}</p>
                <button onClick={() => setTab(tab)} className="text-xs text-[#4A1A6B] underline">ลองใหม่</button>
              </div>
            ) : groupData.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">ไม่มีข้อมูล</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div style={{ height: 320, position: "relative" }}>
                  <ChartBox type="bar" passed={0} notPassed={0} data={groupData} />
                </div>
                <div className="max-h-80 overflow-y-auto pr-1">
                  {groupData.map((item) => <ProgressRow key={item.key} item={item} />)}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
