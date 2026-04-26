"use client"
import { useEffect, useState } from "react"
import { api, PendingRegistration } from "@/lib/api"

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
}

export default function RegistrationsPage() {
  const [items, setItems] = useState<PendingRegistration[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("pending")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PendingRegistration | null>(null)
  const [action, setAction] = useState<"approve" | "reject" | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [approveUsername, setApproveUsername] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  function load() {
    setLoading(true)
    api.adminRegistrations(statusFilter)
      .then((r) => { setItems(r.results); setTotal(r.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  function openAction(item: PendingRegistration, act: "approve" | "reject") {
    setSelected(item)
    setAction(act)
    setRejectReason("")
    setApproveUsername(item.email?.split("@")[0] || `user_${item.id}`)
    setError("")
  }

  async function handleSubmit() {
    if (!selected || !action) return
    setSaving(true)
    setError("")
    try {
      const body = action === "approve"
        ? { action: "approve", username: approveUsername }
        : { action: "reject", reject_reason: rejectReason }
      await api.adminRegistrationAction(selected.id, body)
      setSuccessMsg(action === "approve" ? "อนุมัติเรียบร้อยแล้ว" : "ปฏิเสธคำขอเรียบร้อยแล้ว")
      setSelected(null)
      setAction(null)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#4A1A6B]">อนุมัติคำขอสมัครสมาชิก</h2>
          <p className="text-sm text-gray-500 mt-0.5">ทั้งหมด {total} รายการ</p>
        </div>
        {/* Status filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { value: "pending", label: "รอพิจารณา" },
            { value: "approved", label: "อนุมัติแล้ว" },
            { value: "rejected", label: "ปฏิเสธแล้ว" },
            { value: "all", label: "ทั้งหมด" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-white text-[#4A1A6B] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4 flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-green-500">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">กำลังโหลด...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            {statusFilter === "pending" ? "✅ ไม่มีคำขอที่รอพิจารณา" : "ไม่พบรายการ"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3 text-left font-semibold">ยศ / หน่วย</th>
                <th className="px-4 py-3 text-left font-semibold">วันที่ส่งคำขอ</th>
                <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-left font-semibold">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.full_name_th}</p>
                    {item.email && <p className="text-gray-500 text-xs">{item.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{item.rank_display}</p>
                    <p className="text-gray-500 text-xs">{item.unit}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(item.submitted_at).toLocaleDateString("th-TH", {
                      year: "numeric", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[item.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {item.status_display}
                    </span>
                    {item.reject_reason && (
                      <p className="text-red-500 text-xs mt-0.5">{item.reject_reason}</p>
                    )}
                    {item.reviewed_by && (
                      <p className="text-gray-400 text-xs mt-0.5">โดย {item.reviewed_by}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openAction(item, "approve")}
                          className="bg-green-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-700"
                        >
                          อนุมัติ
                        </button>
                        <button
                          onClick={() => openAction(item, "reject")}
                          className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs font-medium hover:bg-red-200"
                        >
                          ปฏิเสธ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Action Modal */}
      {selected && action && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-[#4A1A6B]">
                {action === "approve" ? "✅ อนุมัติคำขอสมัครสมาชิก" : "❌ ปฏิเสธคำขอสมัครสมาชิก"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* ข้อมูลผู้สมัคร */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                <p><span className="text-gray-500">ชื่อ:</span> <strong>{selected.full_name_th}</strong></p>
                <p><span className="text-gray-500">ยศ:</span> {selected.rank_display}</p>
                <p><span className="text-gray-500">หน่วย:</span> {selected.unit}</p>
                {selected.email && <p><span className="text-gray-500">อีเมล:</span> {selected.email}</p>}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
              )}

              {action === "approve" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username สำหรับเข้าสู่ระบบ
                  </label>
                  <input
                    type="text"
                    value={approveUsername}
                    onChange={e => setApproveUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                  />
                  <p className="text-gray-400 text-xs mt-1">Password จะถูกสุ่มอัตโนมัติ — แจ้ง user ให้เปลี่ยนรหัสผ่านหลัง login ครั้งแรก</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลที่ปฏิเสธ</label>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="เช่น ข้อมูลไม่ครบถ้วน, ไม่อยู่ในสังกัด ฯลฯ"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                  />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => { setSelected(null); setAction(null) }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 ${
                  action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {saving ? "กำลังดำเนินการ..." : action === "approve" ? "ยืนยัน อนุมัติ" : "ยืนยัน ปฏิเสธ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
