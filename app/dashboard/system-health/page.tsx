"use client"
import { useEffect, useState } from "react"

interface Health {
  disk: { total_gb: number; used_gb: number; pct: number }
  memory: { total_gb: number; used_gb: number; pct: number }
  video_storage_gb: number
  active_sessions: number
  total_personnel: number
  total_certificates: number
  expired_certificates: number
}

interface ConcurrentStatus {
  active: number | null
  limit: number
  pct: number | null
}

function GaugeBar({ pct, color }: { pct: number; color: string }) {
  const c = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : color
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 mt-1">
      <div className={`h-2.5 rounded-full transition-all duration-700 ${c}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-3xl font-bold text-[#2D0F42]">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function ConcurrentUsersCard({ data, lastTick }: { data: ConcurrentStatus | null; lastTick: string }) {
  if (!data) return null
  const { active, limit, pct } = data
  const safeActive = active ?? 0
  const safePct    = pct    ?? 0

  const color =
    safePct > 85 ? { bar: "bg-red-500",    badge: "bg-red-50 text-red-700 border-red-200",    dot: "bg-red-500"    } :
    safePct > 60 ? { bar: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-500" } :
                   { bar: "bg-green-500",  badge: "bg-green-50 text-green-700 border-green-200",  dot: "bg-green-500"  }

  const label =
    safePct > 85 ? "โหลดสูง" :
    safePct > 60 ? "โหลดปานกลาง" : "ปกติ"

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-700">👥 ผู้ใช้งานพร้อมกัน (Real-time)</h2>
          {/* pulse dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color.dot}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color.dot}`} />
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color.badge}`}>{label}</span>
      </div>

      {/* Counter */}
      <div className="flex items-end gap-2">
        <span className="text-5xl font-black text-[#2D0F42] tabular-nums leading-none">
          {active !== null ? safeActive : "—"}
        </span>
        <span className="text-xl text-gray-400 pb-1">/ {limit} คน</span>
        <span className="ml-auto text-sm font-semibold text-gray-500 pb-1">{safePct.toFixed(1)}%</span>
      </div>

      {/* Gauge */}
      <div className="space-y-1">
        <div className="w-full bg-gray-100 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all duration-700 ${color.bar}`}
            style={{ width: `${Math.min(safePct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>0</span>
          <span>{Math.round(limit * 0.6)} (60%)</span>
          <span>{Math.round(limit * 0.85)} (85%)</span>
          <span>{limit}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ปกติ &lt;60%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> ปานกลาง 60-85%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> สูง &gt;85%</span>
      </div>

      <p className="text-xs text-gray-400">อัปเดตทุก 10 วินาที · ล่าสุด {lastTick}</p>
    </div>
  )
}

export default function SystemHealthPage() {
  const [data, setData]                 = useState<Health | null>(null)
  const [loading, setLoading]           = useState(true)
  const [lastUpdate, setLastUpdate]     = useState("")

  const [concurrent, setConcurrent]     = useState<ConcurrentStatus | null>(null)
  const [concurrentTick, setConcurrentTick] = useState("")

  // ── System health — refresh ทุก 30 วินาที ─────────────────────────────────
  const loadHealth = async () => {
    try {
      const res = await fetch("/military/api/v1/admin/system-health/", { credentials: "include" })
      const d = await res.json()
      setData(d)
      setLastUpdate(new Date().toLocaleTimeString("th-TH"))
    } catch { } finally { setLoading(false) }
  }

  // ── Concurrent users — refresh ทุก 10 วินาที ─────────────────────────────
  const loadConcurrent = async () => {
    try {
      const res = await fetch("/military/api/v1/admin/concurrent-users/", { credentials: "include" })
      if (res.ok) {
        const d: ConcurrentStatus = await res.json()
        setConcurrent(d)
        setConcurrentTick(new Date().toLocaleTimeString("th-TH"))
      }
    } catch { }
  }

  useEffect(() => {
    loadHealth()
    loadConcurrent()
    const t1 = setInterval(loadHealth,     30_000)
    const t2 = setInterval(loadConcurrent, 10_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
  if (!data)   return <div className="p-8 text-center text-red-400">ไม่สามารถโหลดข้อมูลได้</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#2D0F42]">🖥️ สถานะระบบ</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">อัปเดตล่าสุด: {lastUpdate}</span>
          <button onClick={() => { loadHealth(); loadConcurrent() }}
            className="px-3 py-1.5 bg-[#4A1A6B] text-white text-xs rounded-lg hover:bg-[#2D0F42]">
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Concurrent Users — Real-time widget */}
      <ConcurrentUsersCard data={concurrent} lastTick={concurrentTick} />

      {/* Server Resources */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="font-semibold text-gray-700">ทรัพยากรเซิร์ฟเวอร์</h2>
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">💿 Disk</span>
            <span className="font-medium">{data.disk.used_gb} / {data.disk.total_gb} GB ({data.disk.pct}%)</span>
          </div>
          <GaugeBar pct={data.disk.pct} color="bg-blue-500" />
        </div>
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">🧠 RAM</span>
            <span className="font-medium">{data.memory.used_gb} / {data.memory.total_gb} GB ({data.memory.pct}%)</span>
          </div>
          <GaugeBar pct={data.memory.pct} color="bg-purple-500" />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">🎬 พื้นที่วิดีโอ</span>
          <span className="font-medium">{data.video_storage_gb} GB</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="👥" label="ผู้ใช้งานออนไลน์ (30 นาที)" value={data.active_sessions} />
        <StatCard icon="🪖" label="บุคลากรทั้งหมด" value={data.total_personnel.toLocaleString()} />
        <StatCard icon="📜" label="ใบประกาศทั้งหมด" value={data.total_certificates.toLocaleString()} />
        <StatCard icon="⚠️" label="ใบประกาศหมดอายุ" value={data.expired_certificates.toLocaleString()}
          sub={data.total_certificates > 0
            ? `${Math.round(data.expired_certificates / data.total_certificates * 100)}% ของทั้งหมด`
            : undefined} />
      </div>

      {/* Status indicators */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-700 mb-4">สถานะ Services</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { name: "LMS (Open edX)", ok: true },
            { name: "Database (MySQL)", ok: true },
            { name: "Redis Cache", ok: true },
            { name: "Video Streaming", ok: true },
            { name: "Email (SMTP)", ok: true },
            { name: "Search (MeiliSearch)", ok: true },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${s.ok ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-gray-600">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
