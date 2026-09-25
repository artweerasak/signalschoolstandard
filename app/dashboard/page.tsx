/**
 * app/dashboard/page.tsx
 * หน้า Dashboard หลัก — แสดง summary stats + ตารางใบประกาศใกล้หมดอายุ
 */
"use client"

import { useEffect, useState } from "react"
import StatCard from "@/components/StatCard"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
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
      <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-6 py-4 rounded-2xl">
        {loadError}
      </div>
    )
  }

  return (
    <div className="space-y-8">

      <PageHeader title="ภาพรวมระบบ" description="สรุปสถานะบุคลากรและใบประกาศ" />

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
        const barColor = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"
        const textColor = pct > 85 ? "text-[#b91c1c]" : pct > 60 ? "text-[#b45309]" : "text-[#15803d]"
        const bgColor   = pct > 85 ? "bg-[#fee2e2] border-[#f3a0a0]" : pct > 60 ? "bg-[#fef3c7] border-[#fde68a]" : "bg-[#dcfce7] border-[#bbf7d0]"
        const label     = pct > 85 ? "โหลดสูง ⚠️" : pct > 60 ? "โหลดปานกลาง" : "ปกติ"
        return (
          <div className={`rounded-2xl border px-5 py-4 ${bgColor}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${barColor}`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${barColor}`} />
                </span>
                <span className="text-sm font-semibold text-[#2D0F42]">ผู้ใช้งานพร้อมกันขณะนี้</span>
                <span className={`text-xs font-medium ${textColor}`}>{label}</span>
              </div>
              <span className={`text-lg font-black tabular-nums font-mono ${textColor}`}>
                {concurrent.active !== null ? active : "—"} <span className="text-sm font-normal text-[#9a92a8]">/ {limit} คน</span>
              </span>
            </div>
            <div className="w-full bg-white/70 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-[#9a92a8] mt-1 font-mono">
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
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0ecf6] flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <h3 className="font-semibold text-[#4A1A6B]">ใบประกาศใกล้หมดอายุ (30 วัน)</h3>
            <span className="ml-auto text-xs bg-[#fef3c7] text-[#b45309] px-2.5 py-1 rounded-full font-mono font-semibold">
              {expiring.length} รายการ
            </span>
          </div>
          <div className="overflow-x-auto">
            {expiring.length === 0 ? (
              <div className="px-6 py-10 text-center text-[#9a92a8] text-sm">
                ไม่มีใบประกาศที่ใกล้หมดอายุ ✓
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f7f5fa] text-[#6b6478] text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">ชื่อ-ยศ</th>
                    <th className="px-4 py-3 text-left">หน่วย</th>
                    <th className="px-4 py-3 text-left">หลักสูตร</th>
                    <th className="px-4 py-3 text-left">วันหมดอายุ</th>
                    <th className="px-4 py-3 text-center">คงเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ecf6]">
                  {expiring.map((item, i) => (
                    <tr key={i} className="hover:bg-[#f7f5fa] transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-[#2D0F42]">{item.rank} {item.full_name}</span>
                      </td>
                      <td className="px-4 py-3 text-[#6b6478]">{item.unit}</td>
                      <td className="px-4 py-3 text-[#6b6478] truncate max-w-[160px] font-mono text-xs">{item.course_id}</td>
                      <td className="px-4 py-3 text-[#6b6478]">
                        {new Date(item.expiry_date).toLocaleDateString("th-TH", {
                          year: "numeric", month: "short", day: "numeric"
                        })}
                      </td>
                      <td className={`px-4 py-3 text-center font-mono ${getDaysLeftColor(item.days_left)}`}>
                        {item.days_left} วัน
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Rank Stats — ใช้พื้นที่ 1/3 */}
        <Card>
          <div className="px-6 py-4 border-b border-[#f0ecf6] flex items-center gap-2">
            <span className="text-lg">🎖️</span>
            <h3 className="font-semibold text-[#4A1A6B]">บุคลากรแยกตามยศ</h3>
          </div>
          <div className="px-6 py-4 space-y-3">
            {rankStats.length === 0 ? (
              <p className="text-[#9a92a8] text-sm text-center py-6">ยังไม่มีข้อมูล</p>
            ) : (
              rankStats.map((r) => (
                <div key={r.code} className="flex items-center gap-3">
                  <span className="text-sm text-[#4a4456] w-28 shrink-0">{r.label}</span>
                  <div className="flex-1 bg-[#f0ecf6] rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-[#4A1A6B] to-[#7B3FA0] h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (r.count / (summary?.total_personnel || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-[#6b6478] w-8 text-right font-mono">{r.count}</span>
                </div>
              ))
            )}
          </div>
        </Card>

      </div>
    </div>
  )
}
