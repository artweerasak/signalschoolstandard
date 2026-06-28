/**
 * app/dashboard/page.tsx
 * หน้า Dashboard หลัก — แสดง summary stats + ตารางใบประกาศใกล้หมดอายุ
 */
"use client"

import { useEffect, useState } from "react"
import StatCard from "@/components/StatCard"
import { api, DashboardSummary, ExpiringSoonItem, RankStat } from "@/lib/api"

function getDaysLeftColor(days: number): string {
  if (days <= 7)  return "text-red-600 font-bold"
  if (days <= 14) return "text-orange-500 font-semibold"
  return "text-yellow-600"
}

interface ConcurrentStatus { active: number | null; limit: number; pct: number | null }

export default function DashboardPage() {
  const [summary, setSummary]       = useState<DashboardSummary | null>(null)
  const [expiring, setExpiring]     = useState<ExpiringSoonItem[]>([])
  const [rankStats, setRankStats]   = useState<RankStat[]>([])
  const [loadError, setLoadError]   = useState("")
  const [concurrent, setConcurrent] = useState<ConcurrentStatus | null>(null)

  useEffect(() => {
    Promise.all([
      api.dashboardSummary(),
      api.expiringSoon(),
      api.rankStats(),
    ])
      .then(([sum, exp, ranks]) => {
        setSummary(sum)
        setExpiring(exp.results)
        setRankStats(ranks.results)
      })
      .catch(() => setLoadError("ไม่สามารถโหลดข้อมูลได้"))
  }, [])

  useEffect(() => {
    async function fetchConcurrent() {
      try {
        const res = await fetch("/military/api/v1/admin/concurrent-users/", { credentials: "include" })
        if (res.ok) setConcurrent(await res.json())
      } catch { }
    }
    fetchConcurrent()
    const t = setInterval(fetchConcurrent, 10_000)
    return () => clearInterval(t)
  }, [])

  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl">
        {loadError}
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Page title */}
      <div>
        <h2 className="text-2xl font-bold text-[#2D0F42]">ภาพรวมระบบ</h2>
        <p className="text-gray-500 text-sm mt-1">สรุปสถานะบุคลากรและใบประกาศ</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="บุคลากรทั้งหมด"
          value={summary?.total_personnel ?? "—"}
          icon="👤"
          color="purple"
          subtitle="คน"
        />
        <StatCard
          title="ใบประกาศยังใช้ได้"
          value={summary?.active_count ?? "—"}
          icon="✅"
          color="green"
          subtitle="ฉบับ"
        />
        <StatCard
          title="ใบประกาศหมดอายุ"
          value={summary?.expired_count ?? "—"}
          icon="❌"
          color="red"
          subtitle="ฉบับ"
        />
        <StatCard
          title="ต่ออายุแล้ว"
          value={summary?.renewed_count ?? "—"}
          icon="🔄"
          color="blue"
          subtitle="ฉบับ"
        />
        <StatCard
          title="ใกล้หมดอายุ (30 วัน)"
          value={summary?.near_expiry_count ?? "—"}
          icon="⚠️"
          color="yellow"
          subtitle="ฉบับ"
        />
      </div>

      {/* Concurrent Users Real-time Bar */}
      {concurrent && (() => {
        const active  = concurrent.active ?? 0
        const limit   = concurrent.limit
        const pct     = concurrent.pct ?? 0
        const barColor = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-green-500"
        const textColor = pct > 85 ? "text-red-600" : pct > 60 ? "text-yellow-600" : "text-green-600"
        const bgColor   = pct > 85 ? "bg-red-50 border-red-200" : pct > 60 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"
        const label     = pct > 85 ? "โหลดสูง ⚠️" : pct > 60 ? "โหลดปานกลาง" : "ปกติ"
        return (
          <div className={`rounded-xl border px-5 py-4 ${bgColor}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${barColor}`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${barColor}`} />
                </span>
                <span className="text-sm font-semibold text-gray-700">ผู้ใช้งานพร้อมกันขณะนี้</span>
                <span className={`text-xs font-medium ${textColor}`}>{label}</span>
              </div>
              <span className={`text-lg font-black tabular-nums ${textColor}`}>
                {concurrent.active !== null ? active : "—"} <span className="text-sm font-normal text-gray-400">/ {limit} คน</span>
              </span>
            </div>
            <div className="w-full bg-white/70 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0</span>
              <span>{pct.toFixed(1)}% ของ {limit} คน · อัปเดตทุก 10 วินาที</span>
              <span>{limit}</span>
            </div>
          </div>
        )
      })()}

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Expiring Soon Table — ใช้พื้นที่ 2/3 */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <h3 className="font-semibold text-[#4A1A6B]">ใบประกาศใกล้หมดอายุ (30 วัน)</h3>
            <span className="ml-auto text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {expiring.length} รายการ
            </span>
          </div>
          <div className="overflow-x-auto">
            {expiring.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">
                ไม่มีใบประกาศที่ใกล้หมดอายุ ✓
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <th className="px-4 py-3 text-left">ชื่อ-ยศ</th>
                    <th className="px-4 py-3 text-left">หน่วย</th>
                    <th className="px-4 py-3 text-left">หลักสูตร</th>
                    <th className="px-4 py-3 text-left">วันหมดอายุ</th>
                    <th className="px-4 py-3 text-center">คงเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expiring.map((item, i) => (
                    <tr key={i} className="hover:bg-purple-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{item.rank} {item.full_name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-[160px]">{item.course_id}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(item.expiry_date).toLocaleDateString("th-TH", {
                          year: "numeric", month: "short", day: "numeric"
                        })}
                      </td>
                      <td className={`px-4 py-3 text-center ${getDaysLeftColor(item.days_left)}`}>
                        {item.days_left} วัน
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Rank Stats — ใช้พื้นที่ 1/3 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-lg">🎖️</span>
            <h3 className="font-semibold text-[#4A1A6B]">บุคลากรแยกตามยศ</h3>
          </div>
          <div className="px-6 py-4 space-y-3">
            {rankStats.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">ยังไม่มีข้อมูล</p>
            ) : (
              rankStats.map((r) => (
                <div key={r.code} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-28 shrink-0">{r.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-[#4A1A6B] h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (r.count / (summary?.total_personnel || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{r.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
