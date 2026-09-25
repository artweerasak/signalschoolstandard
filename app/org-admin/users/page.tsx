"use client"
import { useEffect, useState, useCallback } from "react"
import { api, OrgMemberRow } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "error" | "warning" }> = {
  passed:     { label: "ผ่านแล้ว",     tone: "success" },
  expired:    { label: "หมดอายุ",      tone: "error" },
  not_tested: { label: "ยังไม่ทดสอบ", tone: "warning" },
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
      <PageHeader
        title="กำลังพลในสังกัด"
        action={<Button variant="secondary" onClick={handleExportCSV}>⬇ ดาวน์โหลด CSV</Button>}
      />

      <Card>
        <div className="p-4 border-b border-[#f0ecf6]">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ..."
            className="border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f5fa] text-xs text-[#6b6478] uppercase">
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
                ? <tr><td colSpan={5} className="py-8 text-center text-[#9a92a8]">กำลังโหลด...</td></tr>
                : rows.length === 0
                  ? <tr><td colSpan={5} className="py-8 text-center text-[#9a92a8]">ไม่พบข้อมูล</td></tr>
                  : rows.map(r => {
                      const s = STATUS_LABEL[r.cert_status ?? ""]
                      return (
                        <tr key={r.user_id} className="hover:bg-[#f7f5fa]">
                          <td className="px-4 py-3 font-medium">{r.full_name}</td>
                          <td className="px-4 py-3 text-[#6b6478]">{r.rank}</td>
                          <td className="px-4 py-3 text-[#6b6478] text-xs">{r.unit}</td>
                          <td className="px-4 py-3 text-center">
                            {s && <StatusPill tone={s.tone}>{s.label}</StatusPill>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#6b6478]">{r.expiry_date ?? "-"}</td>
                        </tr>
                      )
                    })
              }
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-[#f0ecf6] text-xs text-[#9a92a8] font-mono">รวม {rows.length} คน</div>
      </Card>
    </div>
  )
}
