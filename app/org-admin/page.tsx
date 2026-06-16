"use client"
import { useEffect, useState } from "react"
import { api, OrgAdminDashboard, OrgMemberRow } from "@/lib/api"

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${color} p-5 shadow-sm`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function MemberTable({ rows, title, emptyText }: { rows: OrgMemberRow[]; title: string; emptyText: string }) {
  const [q, setQ] = useState("")
  const filtered = rows.filter(r =>
    r.full_name.includes(q) || r.unit.includes(q) || r.rank.includes(q)
  )
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title} <span className="text-gray-400 font-normal text-sm">({rows.length} คน)</span></h3>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="ค้นหา..." className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
              <th className="px-4 py-3 text-left">ชั้นยศ</th>
              <th className="px-4 py-3 text-left">หน่วย</th>
              <th className="px-4 py-3 text-left">หลักสูตร</th>
              <th className="px-4 py-3 text-left">วันหมดอายุ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0
              ? <tr><td colSpan={5} className="py-6 text-center text-gray-400">{emptyText}</td></tr>
              : filtered.map(r => (
                <tr key={r.user_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.rank}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{r.unit}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{r.course_name || "-"}</td>
                  <td className="px-4 py-3 text-xs">{r.expiry_date || "-"}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function OrgAdminPage() {
  const [data, setData]       = useState<OrgAdminDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    api.orgAdminDashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-full items-center justify-center text-gray-400">กำลังโหลด...</div>
  if (error)   return <div className="p-6 text-red-500">{error}</div>
  if (!data)   return null

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#4A1A6B]">ภาพรวมหน่วย</h1>
        <p className="text-gray-500 text-sm mt-1">{data.org_name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="กำลังพลทั้งหมด"  value={data.total}      color="border-blue-500" />
        <StatCard label="ผ่านแล้ว"          value={data.passed}     sub={`${data.pct_passed}%`}      color="border-green-500" />
        <StatCard label="ใบประกาศหมดอายุ"  value={data.expired}    sub={`${data.pct_expired}%`}     color="border-red-500" />
        <StatCard label="ยังไม่เคยทดสอบ"  value={data.not_tested} sub={`${data.pct_not_tested}%`}  color="border-yellow-500" />
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <p className="text-sm font-medium mb-2">อัตราการผ่าน: <strong>{data.pct_passed}%</strong></p>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div className="h-4 bg-green-500 rounded-full transition-all" style={{ width: `${data.pct_passed}%` }} />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>ผ่าน {data.passed}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>หมดอายุ {data.expired}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/>ยังไม่ทดสอบ {data.not_tested}</span>
        </div>
      </div>

      <MemberTable rows={data.passed_list}  title="รายชื่อผู้ผ่านแล้ว"            emptyText="ไม่มีข้อมูล" />
      <MemberTable rows={data.expired_list} title="รายชื่อผู้ที่ใบประกาศหมดอายุ" emptyText="ไม่มีรายการ" />
    </div>
  )
}
