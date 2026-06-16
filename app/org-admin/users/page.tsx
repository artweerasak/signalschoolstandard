"use client"
import { useEffect, useState, useCallback } from "react"
import { api, OrgMemberRow } from "@/lib/api"

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  passed:     { label: "ผ่านแล้ว",         cls: "bg-green-100 text-green-700" },
  expired:    { label: "หมดอายุ",          cls: "bg-red-100 text-red-600" },
  not_tested: { label: "ยังไม่ทดสอบ",     cls: "bg-yellow-100 text-yellow-700" },
}

export default function OrgAdminUsersPage() {
  const [rows, setRows]       = useState<(OrgMemberRow & { cert_status?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState("")

  const [error, setError] = useState("")
  const load = useCallback(() => {
    setLoading(true)
    api.orgAdminUsers({ q })
      .then(r => setRows(r.results as (OrgMemberRow & { cert_status?: string })[]))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => { load() }, [load])

  async function handleExportCSV() {
    const headers = ["ชื่อ-สกุล", "ชั้นยศ", "หน่วยงาน", "สถานะ", "วันหมดอายุ"]
    const csvRows = [headers, ...rows.map(r => [
      r.full_name, r.rank, r.unit,
      STATUS_LABEL[r.cert_status ?? ""]?.label ?? r.cert_status ?? "",
      r.expiry_date ?? "",
    ])]
    const csv = csvRows.map(r => r.map(c => `"${c}"`).join(",")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "กำลังพลในสังกัด.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="p-6 text-red-500">{error}</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#4A1A6B]">กำลังพลในสังกัด</h1>
        <button onClick={handleExportCSV}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">
          ⬇ ดาวน์โหลด CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
                <th className="px-4 py-3 text-left">ชั้นยศ</th>
                <th className="px-4 py-3 text-left">หน่วยงาน</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-left">วันหมดอายุ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading
                ? <tr><td colSpan={5} className="py-8 text-center text-gray-400">กำลังโหลด...</td></tr>
                : rows.length === 0
                  ? <tr><td colSpan={5} className="py-8 text-center text-gray-400">ไม่พบข้อมูล</td></tr>
                  : rows.map(r => {
                      const s = STATUS_LABEL[r.cert_status ?? ""]
                      return (
                        <tr key={r.user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{r.full_name}</td>
                          <td className="px-4 py-3 text-gray-600">{r.rank}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{r.unit}</td>
                          <td className="px-4 py-3 text-center">
                            {s && <span className={`px-2 py-0.5 rounded-full text-xs ${s.cls}`}>{s.label}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{r.expiry_date ?? "-"}</td>
                        </tr>
                      )
                    })
              }
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t text-xs text-gray-400">รวม {rows.length} คน</div>
      </div>
    </div>
  )
}
