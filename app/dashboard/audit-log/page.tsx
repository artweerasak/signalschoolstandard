"use client"
import { useEffect, useState, useCallback } from "react"

interface LogEntry {
  id: number; username: string; full_name: string
  method: string; path: string; ip_address: string; created_at: string
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-green-100 text-green-700",
  PUT: "bg-yellow-100 text-yellow-700",
  PATCH: "bg-yellow-100 text-yellow-700",
  DELETE: "bg-red-100 text-red-700",
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState("")
  const [method, setMethod] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "50" })
      if (search) qs.set("search", search)
      if (method) qs.set("action", method)
      const res = await fetch(`/military/api/v1/admin/audit-log/?${qs}`, { credentials: "include" })
      const d = await res.json()
      setLogs(d.results || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
    } catch { } finally { setLoading(false) }
  }, [page, search, method])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#2D0F42]">📋 Audit Log</h1>
        <span className="text-sm text-gray-500">{total.toLocaleString()} รายการ</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="ค้นหา username หรือ path..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
        <select value={method} onChange={e => { setMethod(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none">
          <option value="">ทุก Method</option>
          {["GET","POST","PUT","PATCH","DELETE"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">เวลา</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ผู้ใช้</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Method</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Path</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">ไม่พบรายการ</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("th-TH", { hour12: false })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{log.username}</div>
                      {log.full_name && <div className="text-xs text-gray-400">{log.full_name}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${METHOD_COLORS[log.method] || "bg-gray-100 text-gray-600"}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600 max-w-xs truncate">{log.path}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{log.ip_address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">หน้า {page} จาก {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">← ก่อนหน้า</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">ถัดไป →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
