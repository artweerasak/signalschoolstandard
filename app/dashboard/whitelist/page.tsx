"use client"
import { useEffect, useState } from "react"
import { api, WhitelistItem } from "@/lib/api"

const PAGE_SIZE = 50

export default function WhitelistPage() {
  const [enabled, setEnabled] = useState(false)
  const [items, setItems] = useState<WhitelistItem[]>([])
  const [total, setTotal] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [addText, setAddText] = useState("")
  const [note, setNote] = useState("")
  const [adding, setAdding] = useState(false)
  const [result, setResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null)
  const [error, setError] = useState("")
  const [toggling, setToggling] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function load() {
    setLoading(true)
    api.adminWhitelist({ search, page, page_size: PAGE_SIZE })
      .then((r) => { setItems(r.results); setTotal(r.count); setEnabled(r.enabled); setActiveCount(r.active_count) })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false))
  }
  useEffect(() => { setPage(1) }, [search])
  useEffect(() => { load() }, [search, page]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle() {
    setToggling(true); setError("")
    try {
      const r = await api.adminWhitelistToggle(!enabled)
      setEnabled(r.enabled)
    } catch { setError("สลับสถานะไม่สำเร็จ") } finally { setToggling(false) }
  }

  async function addBatch() {
    if (!addText.trim()) return
    setAdding(true); setError(""); setResult(null)
    try {
      const r = await api.adminWhitelistAdd(addText, note)
      setResult({ added: r.added, skipped: r.skipped, invalid: r.invalid })
      setActiveCount(r.active_count)
      setAddText(""); setNote("")
      setPage(1); load()
    } catch { setError("เพิ่มรายชื่อไม่สำเร็จ") } finally { setAdding(false) }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    setAddText((prev) => (prev ? prev + "\n" : "") + text)
    e.target.value = ""
  }

  async function removeItem(id: number) {
    if (!confirm("ลบรายชื่อนี้ออกจาก whitelist?")) return
    try { await api.adminWhitelistDelete(id); load() } catch { setError("ลบไม่สำเร็จ") }
  }
  async function toggleActive(it: WhitelistItem) {
    try { await api.adminWhitelistSetActive(it.id, !it.is_active); load() } catch { setError("แก้สถานะไม่สำเร็จ") }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-[#2D0F42]">รายชื่อผู้มีสิทธิ์สมัคร (Whitelist)</h2>
        <p className="text-gray-500 text-sm mt-1">เลขบัตรประชาชนที่หน่วยอนุญาตให้สมัครสมาชิกได้ (เก็บแบบเข้ารหัส HMAC ไม่เก็บเลขดิบ)</p>
      </div>

      {/* Enforcement toggle */}
      <div className={`rounded-xl border p-5 flex items-center justify-between gap-4 ${enabled ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
        <div>
          <p className="font-semibold text-gray-800">
            {enabled ? "🔒 บังคับ whitelist: เปิดอยู่" : "🔓 บังคับ whitelist: ปิดอยู่"}
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            {enabled
              ? `เฉพาะ ${activeCount.toLocaleString()} เลขบัตรในรายชื่อเท่านั้นที่สมัครได้`
              : "ตอนนี้ใครก็สมัครได้ (ยังต้องรอ admin อนุมัติ) — เปิดสวิตช์เมื่อโหลดรายชื่อครบแล้ว"}
          </p>
        </div>
        <button onClick={toggle} disabled={toggling}
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${enabled ? "bg-gray-500 hover:bg-gray-600" : "bg-green-600 hover:bg-green-700"}`}>
          {enabled ? "ปิดการบังคับ" : "เปิดการบังคับ"}
        </button>
      </div>

      {enabled && activeCount === 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          ⚠️ เปิดบังคับอยู่แต่รายชื่อว่าง — ตอนนี้จะไม่มีใครสมัครได้เลย กรุณาเพิ่มเลขบัตรด้านล่าง
        </div>
      )}

      {/* Add box */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <p className="font-semibold text-gray-800">เพิ่มเลขบัตรเข้ารายชื่อ</p>
        <textarea value={addText} onChange={(e) => setAddText(e.target.value)} rows={5}
          placeholder="วางเลขบัตรประชาชน 13 หลัก (คั่นด้วยขึ้นบรรทัด, comma, เว้นวรรค ก็ได้)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#7B3FA0] outline-none" />
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ/รุ่น (ไม่บังคับ)"
            className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <label className="text-sm text-[#4A1A6B] cursor-pointer border border-[#7B3FA0] rounded-lg px-3 py-2 hover:bg-purple-50">
            📄 เลือกไฟล์ CSV/TXT
            <input type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
          </label>
          <button onClick={addBatch} disabled={adding || !addText.trim()}
            className="bg-[#4A1A6B] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a1355] disabled:opacity-50">
            {adding ? "กำลังเพิ่ม..." : "เพิ่มเข้า whitelist"}
          </button>
        </div>
        {result && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2 text-sm">
            ✅ เพิ่มใหม่ {result.added} · มีอยู่แล้ว/เปิดใช้ซ้ำ {result.skipped} · เลขไม่ถูกต้อง {result.invalid}
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}
      </div>

      {/* Search + count */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา ชื่อ/หมายเหตุ/เลขที่ปิดบัง"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 max-w-full" />
        <span className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} · เปิดใช้ {activeCount.toLocaleString()}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-gray-400">กำลังโหลด...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">ยังไม่มีรายชื่อ</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">เลขบัตร (ปิดบัง)</th>
                <th className="px-4 py-3 text-left font-semibold">หมายเหตุ/รุ่น</th>
                <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-left font-semibold">เพิ่มเมื่อ</th>
                <th className="px-4 py-3 text-left font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-800">{it.national_id_masked || "—"}
                    {it.label && <span className="ml-2 text-gray-500">{it.label}</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{it.note || "—"}</td>
                  <td className="px-4 py-3">
                    {it.used
                      ? <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">สมัครแล้ว</span>
                      : it.is_active
                        ? <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">เปิดใช้</span>
                        : <span className="inline-block px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs">ปิด</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(it.created_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                    {it.added_by && <span className="block text-gray-400">โดย {it.added_by}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => toggleActive(it)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">
                        {it.is_active ? "ปิด" : "เปิด"}
                      </button>
                      <button onClick={() => removeItem(it.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1 flex-wrap gap-2">
          <span className="text-xs text-gray-500">หน้า {page} / {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">ก่อนหน้า</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">ถัดไป</button>
          </div>
        </div>
      )}
    </div>
  )
}
