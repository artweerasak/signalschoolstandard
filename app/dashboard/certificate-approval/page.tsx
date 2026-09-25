"use client"
import { useState, useEffect, useCallback } from "react"

const API = "/military/api/v1"

interface Batch {
  id: number
  name: string
  course_id: string
  course_name: string
  enrollment_start: string
  enrollment_end: string
  approve_date: string
  status: string
  note: string
  pending_count?: number
  approved_count?: number
  created_at?: string
}

interface PendingUser {
  id: number
  username: string
  full_name: string
  rank: string
  unit: string
  passed_at: string
  score: number | null
  status: string
  cert_uuid: string
}

const PENDING_PAGE_SIZE = 20

export default function CertificateApprovalPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [pendingPage, setPendingPage] = useState(1)
  const [pendingSearch, setPendingSearch] = useState("")
  const [batchCounts, setBatchCounts] = useState({ pending: 0, approved: 0, total: 0 })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [approving, setApproving] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [msg, setMsg] = useState("")
  const [courses, setCourses] = useState<any[]>([])

  const pendingTotalPages = Math.max(1, Math.ceil(pendingTotal / PENDING_PAGE_SIZE))

  const [form, setForm] = useState({
    name: "",
    course_id: "",
    enrollment_start: "",
    enrollment_end: "",
    approve_date: "",
    note: "",
  })

  const [editForm, setEditForm] = useState({
    name: "",
    enrollment_start: "",
    enrollment_end: "",
    approve_date: "",
    note: "",
  })

  const fetchBatches = useCallback(async () => {
    const r = await fetch(`${API}/cert/batches/`, { credentials: "include" })
    if (r.ok) {
      const d = await r.json()
      setBatches(d.batches || [])
    }
  }, [])

  const loadPendingList = useCallback(async (batchId: number, page: number, search: string) => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(PENDING_PAGE_SIZE) })
    if (search) qs.set("search", search)
    const r = await fetch(`${API}/cert/batches/${batchId}/?${qs}`, { credentials: "include" })
    if (r.ok) {
      const d = await r.json()
      setPendingUsers(d.pending || [])
      setPendingTotal(d.pending_count ?? (d.pending || []).length)
      setBatchCounts(d.counts || { pending: 0, approved: 0, total: 0 })
      setSelectedBatch(d.batch)
    }
  }, [])

  const fetchBatchDetail = useCallback(async (batch: Batch) => {
    setSelectedBatch(batch)
    setShowEditForm(false)
    setPendingSearch("")
    setPendingPage(1)
    await loadPendingList(batch.id, 1, "")
  }, [loadPendingList])

  // ค้นหาเปลี่ยน → กลับไปหน้า 1
  useEffect(() => { setPendingPage(1) }, [pendingSearch])

  // เปลี่ยนหน้า/ค้นหา ของรอบที่เลือกอยู่ → โหลดใหม่ (ไม่รีเซ็ต batch ที่เลือก)
  useEffect(() => {
    if (!selectedBatch) return
    loadPendingList(selectedBatch.id, pendingPage, pendingSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPage, pendingSearch])

  useEffect(() => {
    fetchBatches()
    fetch(`${API}/courses/`, { credentials: "include" })
      .then(r => r.json()).then(d => setCourses(d.results || [])).catch(() => {})
  }, [fetchBatches])

  const handleCreate = async () => {
    if (!form.name || !form.course_id || !form.enrollment_start || !form.enrollment_end || !form.approve_date) {
      setMsg("❌ กรุณากรอกข้อมูลให้ครบ")
      return
    }
    const r = await fetch(`${API}/cert/batches/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    if (r.ok) {
      setMsg("✅ สร้างรอบสำเร็จ")
      setShowCreateForm(false)
      setForm({ name: "", course_id: "", enrollment_start: "", enrollment_end: "", approve_date: "", note: "" })
      fetchBatches()
    } else {
      setMsg("❌ " + (d.error || "เกิดข้อผิดพลาด"))
    }
  }

  const handleScan = async () => {
    if (!selectedBatch) return
    setScanning(true)
    setMsg("")
    const r = await fetch(`${API}/cert/scan-passed/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
      body: JSON.stringify({ batch_id: selectedBatch.id }),
    })
    const d = await r.json()
    setScanning(false)
    setMsg(r.ok ? `✅ ${d.message}` : "❌ " + (d.error || "เกิดข้อผิดพลาด"))
    if (r.ok) fetchBatchDetail(selectedBatch)
  }

  const handleEditOpen = () => {
    if (!selectedBatch) return
    setEditForm({
      name: selectedBatch.name,
      enrollment_start: selectedBatch.enrollment_start,
      enrollment_end: selectedBatch.enrollment_end,
      approve_date: selectedBatch.approve_date,
      note: selectedBatch.note || "",
    })
    setShowEditForm(true)
  }

  const handleEditSave = async () => {
    if (!selectedBatch) return
    const r = await fetch(`${API}/cert/batches/${selectedBatch.id}/`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
      body: JSON.stringify(editForm),
    })
    const d = await r.json()
    if (r.ok) {
      const syncNote = d.synced_certificates ? ` (ปรับวันหมดอายุใบประกาศ ${d.synced_certificates} คนตามรอบใหม่)` : ""
      setMsg(`✅ ${d.message}${syncNote}`)
      setShowEditForm(false)
      fetchBatches()
      fetchBatchDetail(selectedBatch)
    } else {
      setMsg("❌ " + (d.error || "เกิดข้อผิดพลาด"))
    }
  }

  const handleDeleteBatch = async () => {
    if (!selectedBatch) return
    if (!confirm(`ยืนยันลบรอบ "${selectedBatch.name}" ทั้งรอบ?\n(ไม่กระทบใบประกาศที่อนุมัติไปแล้ว)`)) return
    const r = await fetch(`${API}/cert/batches/${selectedBatch.id}/`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrf() },
    })
    const d = await r.json()
    setMsg(r.ok ? `✅ ${d.message}` : "❌ " + (d.error || "เกิดข้อผิดพลาด"))
    if (r.ok) {
      setSelectedBatch(null)
      setPendingUsers([])
      fetchBatches()
    }
  }

  const handleRemovePending = async (p: PendingUser) => {
    if (!selectedBatch) return
    const warnApproved = p.status === "approved"
      ? "\n\n⚠️ คนนี้อนุมัติใบประกาศไปแล้ว การลบจะ \"ยกเลิกใบประกาศ\" ของเขาด้วย"
      : ""
    if (!confirm(`ลบ "${p.full_name}" ออกจากรอบนี้?${warnApproved}`)) return
    setRemovingId(p.id)
    const r = await fetch(`${API}/cert/batches/${selectedBatch.id}/pending/${p.id}/`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrf() },
    })
    const d = await r.json()
    setRemovingId(null)
    setMsg(r.ok ? `✅ ${d.message}` : "❌ " + (d.error || "เกิดข้อผิดพลาด"))
    if (r.ok) { fetchBatches(); fetchBatchDetail(selectedBatch) }
  }

  const handleApprove = async () => {
    if (!selectedBatch) return
    if (!confirm(`ยืนยันการอนุมัติใบประกาศ ${batchCounts.pending} คน?\nวันที่อนุมัติ: ${selectedBatch.approve_date}`)) return
    setApproving(true)
    setMsg("")
    const r = await fetch(`${API}/cert/batches/${selectedBatch.id}/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
      body: JSON.stringify({}),
    })
    const d = await r.json()
    setApproving(false)
    setMsg(r.ok ? `✅ ${d.message}` : "❌ " + (d.error || "เกิดข้อผิดพลาด"))
    if (r.ok) { fetchBatches(); fetchBatchDetail(selectedBatch) }
  }

  const statusLabel: Record<string, { label: string; color: string }> = {
    open:     { label: "เปิดรับ", color: "bg-blue-100 text-blue-700" },
    approved: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
    closed:   { label: "ปิดรอบ", color: "bg-[#f0ecf6] text-[#6b6478]" },
  }
  const userStatusLabel: Record<string, { label: string; color: string }> = {
    pending:  { label: "รออนุมัติ", color: "text-yellow-600 bg-yellow-50" },
    approved: { label: "อนุมัติแล้ว", color: "text-green-700 bg-green-50" },
    rejected: { label: "ไม่ผ่าน", color: "text-red-600 bg-red-50" },
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#2D0F42]">✅ อนุมัติใบประกาศ</h1>
              <p className="text-[#6b6478] text-sm mt-1">จัดการรอบการอนุมัติใบประกาศเป็น Batch</p>
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-800"
            >
              + สร้างรอบใหม่
            </button>
          </div>

          {msg && (
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${msg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {msg}
            </div>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-white rounded-xl border border-[#e6e1ee] p-6 mb-6 shadow-sm">
              <h2 className="font-semibold text-[#4a4456] mb-4">สร้างรอบการอนุมัติใหม่</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">ชื่อรอบ *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="เช่น รอบ มิ.ย. 68"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">หลักสูตร *</label>
                  <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="">-- เลือกหลักสูตร --</option>
                    {courses.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name || c.display_name || c.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">วันเปิดรับเรียน *</label>
                  <input type="date" value={form.enrollment_start} onChange={e => setForm({ ...form, enrollment_start: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">วันปิดรับ / สอบ *</label>
                  <input type="date" value={form.enrollment_end} onChange={e => setForm({ ...form, enrollment_end: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">วันที่อนุมัติใบประกาศ *</label>
                  <input type="date" value={form.approve_date} onChange={e => setForm({ ...form, approve_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">หมายเหตุ</label>
                  <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleCreate} className="bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-800">
                  สร้างรอบ
                </button>
                <button onClick={() => setShowCreateForm(false)} className="border border-gray-300 text-[#6b6478] px-5 py-2 rounded-lg text-sm hover:bg-[#f7f5fa]">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Edit Form */}
          {showEditForm && selectedBatch && (
            <div className="bg-white rounded-xl border border-purple-200 p-6 mb-6 shadow-sm">
              <h2 className="font-semibold text-[#4a4456] mb-4">แก้ไขรอบ: {selectedBatch.name}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">ชื่อรอบ *</label>
                  <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">วันเปิดรับเรียน *</label>
                  <input type="date" value={editForm.enrollment_start} onChange={e => setEditForm({ ...editForm, enrollment_start: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">วันปิดรับ / สอบ *</label>
                  <input type="date" value={editForm.enrollment_end} onChange={e => setEditForm({ ...editForm, enrollment_end: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">วันที่อนุมัติใบประกาศ *</label>
                  <input type="date" value={editForm.approve_date} onChange={e => setEditForm({ ...editForm, approve_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  {selectedBatch.status === "approved" && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ รอบนี้อนุมัติแล้ว — ถ้าเปลี่ยนวันที่นี้ วันหมดอายุใบประกาศของทุกคนที่อนุมัติแล้วจะถูกปรับตามวันที่ใหม่ทันที</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6478] mb-1">หมายเหตุ</label>
                  <input value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleEditSave} className="bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-800">
                  บันทึกการแก้ไข
                </button>
                <button onClick={() => setShowEditForm(false)} className="border border-gray-300 text-[#6b6478] px-5 py-2 rounded-lg text-sm hover:bg-[#f7f5fa]">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Batch List */}
            <div className="col-span-1 space-y-3">
              <h2 className="font-semibold text-[#6b6478] text-sm uppercase tracking-wider">รอบทั้งหมด</h2>
              {batches.length === 0 && (
                <p className="text-[#9a92a8] text-sm text-center py-8">ยังไม่มีรอบ</p>
              )}
              {batches.map(b => {
                const st = statusLabel[b.status] || { label: b.status, color: "bg-[#f0ecf6] text-[#6b6478]" }
                return (
                  <div
                    key={b.id}
                    onClick={() => fetchBatchDetail(b)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer hover:border-purple-400 transition-colors ${selectedBatch?.id === b.id ? "border-purple-500 shadow-sm" : "border-[#e6e1ee]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[#2D0F42] text-sm truncate">{b.name}</p>
                        <p className="text-xs text-[#6b6478] truncate mt-0.5">{b.course_name || b.course_id}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-[#6b6478]">
                      <span>🗓 {b.approve_date}</span>
                      <span>⏳ {b.pending_count} คน</span>
                      <span>✅ {b.approved_count} คน</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Batch Detail */}
            <div className="col-span-2">
              {!selectedBatch ? (
                <div className="bg-white rounded-xl border border-[#e6e1ee] p-12 text-center text-[#9a92a8]">
                  <p className="text-4xl mb-3">📋</p>
                  <p>เลือกรอบเพื่อดูรายละเอียด</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[#e6e1ee] shadow-sm">
                  {/* Header */}
                  <div className="p-5 border-b border-[#f0ecf6]">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="font-bold text-[#2D0F42] text-lg">{selectedBatch.name}</h2>
                        <p className="text-sm text-[#6b6478]">{selectedBatch.course_name || selectedBatch.course_id}</p>
                        <div className="flex gap-4 mt-2 text-xs text-[#6b6478]">
                          <span>📅 ปิดรับ: {selectedBatch.enrollment_end}</span>
                          <span>🏆 อนุมัติ: {selectedBatch.approve_date}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <div className="flex gap-2">
                          <button
                            onClick={handleEditOpen}
                            className="border border-gray-300 text-[#6b6478] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#f7f5fa]"
                          >
                            ✏️ แก้ไขรอบ
                          </button>
                          <button
                            onClick={handleDeleteBatch}
                            className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
                          >
                            🗑️ ลบรอบ
                          </button>
                        </div>
                        <div className="flex gap-4 text-center">
                          <div className="bg-yellow-50 px-3 py-2 rounded-lg">
                            <p className="text-xl font-bold text-yellow-600">{batchCounts.pending}</p>
                            <p className="text-xs text-[#6b6478]">รออนุมัติ</p>
                          </div>
                          <div className="bg-green-50 px-3 py-2 rounded-lg">
                            <p className="text-xl font-bold text-green-600">{batchCounts.approved}</p>
                            <p className="text-xs text-[#6b6478]">อนุมัติแล้ว</p>
                          </div>
                          <div className="bg-[#f7f5fa] px-3 py-2 rounded-lg">
                            <p className="text-xl font-bold text-[#6b6478]">{batchCounts.total}</p>
                            <p className="text-xs text-[#6b6478]">ทั้งหมด</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {selectedBatch.status === "open" && (
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={handleScan}
                          disabled={scanning}
                          className="border border-blue-400 text-blue-700 px-4 py-2 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
                        >
                          {scanning ? "⏳ กำลังสแกน..." : "🔍 สแกนหาผู้ผ่าน"}
                        </button>
                        <button
                          onClick={handleApprove}
                          disabled={approving || batchCounts.pending === 0}
                          className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {approving ? "⏳ กำลังอนุมัติ..." : `✅ อนุมัติทั้งหมด (${batchCounts.pending} คน)`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Search */}
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อ..."
                      value={pendingSearch}
                      onChange={e => setPendingSearch(e.target.value)}
                      className="w-full max-w-sm border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                    />
                  </div>

                  {/* User Table */}
                  <div className="overflow-x-auto">
                    {pendingUsers.length === 0 ? (
                      <p className="text-center text-[#9a92a8] py-10">ยังไม่มีรายชื่อ — กด "สแกนหาผู้ผ่าน" เพื่อดึงข้อมูล</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#f7f5fa] text-[#6b6478] text-xs uppercase">
                            <th className="px-4 py-3 text-left">ชื่อ-สกุล</th>
                            <th className="px-4 py-3 text-left">ยศ / หน่วย</th>
                            <th className="px-4 py-3 text-right">คะแนน</th>
                            <th className="px-4 py-3 text-left">วันที่ผ่าน</th>
                            <th className="px-4 py-3 text-center">สถานะ</th>
                            <th className="px-4 py-3 text-center">จัดการ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f0ecf6]">
                          {pendingUsers.map(u => {
                            const st = userStatusLabel[u.status] || { label: u.status, color: "" }
                            return (
                              <tr key={u.id} className="hover:bg-[#f7f5fa]">
                                <td className="px-4 py-3 font-medium text-[#2D0F42]">{u.full_name}</td>
                                <td className="px-4 py-3 text-[#6b6478] text-xs">
                                  <div>{u.rank}</div>
                                  <div className="truncate max-w-32">{u.unit}</div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-[#4a4456]">
                                  {u.score != null ? `${u.score}%` : "-"}
                                </td>
                                <td className="px-4 py-3 text-[#6b6478] text-xs">{u.passed_at}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleRemovePending(u)}
                                    disabled={removingId === u.id}
                                    className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                                    title={u.status === "approved" ? "ลบ = ยกเลิกใบประกาศด้วย" : "ลบออกจากรอบ"}
                                  >
                                    {removingId === u.id ? "⏳" : "🗑️ ลบ"}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination */}
                  {pendingTotalPages > 1 && (
                    <div className="flex items-center justify-between px-2 py-3 flex-wrap gap-2">
                      <span className="text-xs text-[#6b6478]">
                        แสดง {(pendingPage-1)*PENDING_PAGE_SIZE+1}–{Math.min(pendingPage*PENDING_PAGE_SIZE, pendingTotal)} จาก {pendingTotal.toLocaleString()} รายการ
                      </span>
                      <div className="flex gap-1 items-center">
                        <button onClick={() => setPendingPage(1)} disabled={pendingPage===1} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">«</button>
                        <button onClick={() => setPendingPage(p=>Math.max(1,p-1))} disabled={pendingPage===1} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">‹</button>
                        <span className="px-3 py-1 text-xs bg-[#4A1A6B] text-white rounded">{pendingPage}</span>
                        <span className="text-xs text-[#9a92a8]">/ {pendingTotalPages}</span>
                        <button onClick={() => setPendingPage(p=>Math.min(pendingTotalPages,p+1))} disabled={pendingPage===pendingTotalPages} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">›</button>
                        <button onClick={() => setPendingPage(pendingTotalPages)} disabled={pendingPage===pendingTotalPages} className="px-2 py-1 text-xs border border-[#e6e1ee] rounded hover:bg-[#f7f5fa] disabled:opacity-40">»</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
    </div>
  )
}

function getCsrf(): string {
  if (typeof document === "undefined") return ""
  return document.cookie.split(";").find(c => c.trim().startsWith("csrftoken="))?.split("=")[1] ?? ""
}
