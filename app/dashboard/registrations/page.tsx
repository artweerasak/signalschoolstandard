"use client"
import { useEffect, useState } from "react"
import { api, PendingRegistration } from "@/lib/api"

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
}

const PAGE_SIZE = 20

export default function RegistrationsPage() {
  const [items, setItems] = useState<PendingRegistration[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("pending")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PendingRegistration | null>(null)
  const [action, setAction] = useState<"approve" | "reject" | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [approveUsername, setApproveUsername] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function load() {
    setLoading(true)
    api.adminRegistrations({ status: statusFilter, page, page_size: PAGE_SIZE, search })
      .then((r) => { setItems(r.results); setTotal(r.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // เปลี่ยนสถานะ/ค้นหา → กลับไปหน้า 1 เสมอ
  useEffect(() => { setPage(1) }, [statusFilter, search])
  useEffect(() => { load() }, [statusFilter, search, page]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <p className="text-sm text-[#6b6478] mt-0.5">ทั้งหมด {total} รายการ</p>
        </div>
        {/* Status filter tabs */}
        <div className="flex gap-1 bg-[#f0ecf6] rounded-lg p-1">
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
                  : "text-[#6b6478] hover:text-[#4a4456]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="ค้นหาชื่อ, หน่วย หรืออีเมล..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
        />
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4 flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-green-500">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-[#9a92a8]">
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
            <tbody className="divide-y divide-[#f0ecf6]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#2D0F42]">{item.full_name_th}</p>
                    {item.email && <p className="text-[#6b6478] text-xs">{item.email}</p>}
                    {(item as any).thaid_verified && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-medium">🪪 ThaID ยืนยันแล้ว</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#4a4456]">{item.rank_display}</p>
                    <p className="text-[#6b6478] text-xs">{item.unit}{(item as any).sub_unit ? ` / ${(item as any).sub_unit}` : ""}</p>
                    {(item as any).army_region_display && (item as any).army_region_display !== "ไม่ระบุ" && (
                      <p className="text-purple-500 text-xs">{(item as any).army_region_display}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#6b6478] text-xs">
                    {new Date(item.submitted_at).toLocaleDateString("th-TH", {
                      year: "numeric", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[item.status] ?? "bg-[#f0ecf6] text-[#6b6478]"}`}>
                      {item.status_display}
                    </span>
                    {item.reject_reason && (
                      <p className="text-red-500 text-xs mt-0.5">{item.reject_reason}</p>
                    )}
                    {item.reviewed_by && (
                      <p className="text-[#9a92a8] text-xs mt-0.5">โดย {item.reviewed_by}</p>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-3 flex-wrap gap-2">
          <span className="text-xs text-[#6b6478]">
            แสดง {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} จาก {total.toLocaleString()} รายการ
          </span>
          <div className="flex gap-1 items-center">
            <button onClick={() => setPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">«</button>
            <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">‹</button>
            <span className="px-3 py-1 text-xs bg-[#4A1A6B] text-white rounded">{page}</span>
            <span className="text-xs text-[#9a92a8]">/ {totalPages}</span>
            <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">»</button>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {selected && action && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-[#e6e1ee]">
              <h3 className="text-lg font-bold text-[#4A1A6B]">
                {action === "approve" ? "✅ อนุมัติคำขอสมัครสมาชิก" : "❌ ปฏิเสธคำขอสมัครสมาชิก"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* ข้อมูลผู้สมัคร */}
              <div className="bg-[#f7f5fa] rounded-lg p-4 space-y-1 text-sm">
                <p><span className="text-[#6b6478]">ชื่อ:</span> <strong>{selected.full_name_th}</strong></p>
                <p><span className="text-[#6b6478]">ยศ:</span> {selected.rank_display}</p>
                <p><span className="text-[#6b6478]">หน่วย:</span> {selected.unit}{(selected as any).sub_unit ? ` / ${(selected as any).sub_unit}` : ""}</p>
                {(selected as any).army_region_display && (selected as any).army_region_display !== "ไม่ระบุ" && (
                  <p><span className="text-[#6b6478]">ทัพภาค:</span> {(selected as any).army_region_display}</p>
                )}
                {(selected as any).phone_number && (
                  <p><span className="text-[#6b6478]">เบอร์โทร:</span> {(selected as any).phone_number}</p>
                )}
                {selected.email && <p><span className="text-[#6b6478]">อีเมล:</span> {selected.email}</p>}
                {(selected as any).thaid_verified && (
                  <p className="text-green-700 font-medium">🪪 ยืนยันตัวตนผ่าน ThaID แล้ว</p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
              )}

              {action === "approve" ? (
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">
                    Username สำหรับเข้าสู่ระบบ
                  </label>
                  <input
                    type="text"
                    value={approveUsername}
                    onChange={e => setApproveUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                  />
                  <p className="text-[#9a92a8] text-xs mt-1">Password จะถูกสุ่มอัตโนมัติ — แจ้ง user ให้เปลี่ยนรหัสผ่านหลัง login ครั้งแรก</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">เหตุผลที่ปฏิเสธ</label>
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
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex justify-end gap-3">
              <button
                onClick={() => { setSelected(null); setAction(null) }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-[#6b6478] hover:bg-[#f7f5fa]"
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
