"use client"
import { useEffect, useState, useCallback } from "react"
import { api, Organization } from "@/lib/api"

export default function OrganizationsPage() {
  const [orgs, setOrgs]         = useState<Organization[]>([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState("")
  const [form, setForm]         = useState({ name: "", code: "" })
  const [editOrg, setEditOrg]   = useState<Organization | null>(null)
  const [transferFrom, setTransferFrom] = useState<Organization | null>(null)
  const [targetOrgId, setTargetOrgId]   = useState<number | "">("")
  const [msg, setMsg]           = useState<{ type: "ok" | "err"; text: string } | null>(null)

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const load = useCallback(() => {
    setLoading(true)
    api.adminOrganizations({ q })
      .then(r => setOrgs(r.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.adminCreateOrganization(form)
      setForm({ name: "", code: "" })
      flash("ok", "เพิ่มหน่วยงานสำเร็จ")
      load()
    } catch (err: unknown) { flash("err", (err as Error).message) }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editOrg) return
    try {
      await api.adminUpdateOrganization(editOrg.id, { name: editOrg.name, code: editOrg.code, is_active: editOrg.is_active })
      setEditOrg(null)
      flash("ok", "บันทึกสำเร็จ")
      load()
    } catch (err: unknown) { flash("err", (err as Error).message) }
  }

  async function handleDeactivate(org: Organization) {
    if (!confirm(`ปิดใช้งาน "${org.name}" ?\nกำลังพลที่สังกัดอยู่ยังคงอยู่ในระบบ`)) return
    try {
      await api.adminDeactivateOrganization(org.id)
      flash("ok", "ปิดใช้งานสำเร็จ")
      load()
    } catch (err: unknown) { flash("err", (err as Error).message) }
  }

  async function handleBulkTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferFrom || !targetOrgId) return
    if (!confirm(`ย้ายกำลังพลทั้งหมดจาก "${transferFrom.name}" ไปยังหน่วยที่เลือก ?`)) return
    try {
      const r = await api.adminBulkTransfer(transferFrom.id, Number(targetOrgId))
      flash("ok", `ย้าย ${r.moved} คน จาก ${r.from} → ${r.to} สำเร็จ`)
      setTransferFrom(null)
      setTargetOrgId("")
      load()
    } catch (err: unknown) { flash("err", (err as Error).message) }
  }

  const inputCls = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] w-full"
  const btnPrimary = "bg-[#4A1A6B] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#3a1255] disabled:opacity-50"

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#4A1A6B]">จัดการหน่วยงาน</h1>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* เพิ่มหน่วยงาน */}
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <h2 className="font-semibold mb-3">เพิ่มหน่วยงานใหม่</h2>
        <form onSubmit={handleCreate} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">รหัสหน่วย</label>
            <input value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))}
              placeholder="เช่น มทบ.99" className={inputCls} required />
          </div>
          <div className="flex-[2]">
            <label className="text-xs text-gray-500 mb-1 block">ชื่อหน่วยงาน</label>
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
              placeholder="ชื่อเต็มของหน่วยงาน" className={inputCls} required />
          </div>
          <button type="submit" className={btnPrimary}>+ เพิ่ม</button>
        </form>
      </div>

      {/* รายการ */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b flex gap-3 items-center">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อหรือรหัสหน่วย..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          <span className="text-sm text-gray-500">{orgs.length} หน่วย</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">รหัส</th>
                <th className="px-4 py-3 text-left">ชื่อหน่วยงาน</th>
                <th className="px-4 py-3 text-center">กำลังพล</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : orgs.map(org => (
                <tr key={org.id} className={`hover:bg-gray-50 ${!org.is_active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{org.code}</td>
                  <td className="px-4 py-3 font-medium">{org.name}</td>
                  <td className="px-4 py-3 text-center">{org.member_count ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${org.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {org.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => setEditOrg({ ...org })}
                        className="text-xs text-blue-600 hover:underline">แก้ไข</button>
                      <button onClick={() => setTransferFrom(org)}
                        className="text-xs text-purple-600 hover:underline">โอนย้าย</button>
                      {org.is_active && (
                        <button onClick={() => handleDeactivate(org)}
                          className="text-xs text-red-500 hover:underline">ปิด</button>
                      )}
                      {!org.is_active && (
                        <button onClick={async () => { await api.adminUpdateOrganization(org.id, { is_active: true }); load() }}
                          className="text-xs text-green-600 hover:underline">เปิด</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal แก้ไข */}
      {editOrg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-bold mb-4">แก้ไขหน่วยงาน</h3>
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">รหัสหน่วย</label>
                <input value={editOrg.code} onChange={e => setEditOrg(p => p && ({...p, code: e.target.value}))}
                  className={inputCls} required />
              </div>
              <div>
                <label className="text-xs text-gray-500">ชื่อหน่วยงาน</label>
                <input value={editOrg.name} onChange={e => setEditOrg(p => p && ({...p, name: e.target.value}))}
                  className={inputCls} required />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={editOrg.is_active}
                  onChange={e => setEditOrg(p => p && ({...p, is_active: e.target.checked}))} />
                <label htmlFor="is_active" className="text-sm">เปิดใช้งาน (Active)</label>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className={`${btnPrimary} flex-1`}>บันทึก</button>
                <button type="button" onClick={() => setEditOrg(null)}
                  className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Bulk Transfer */}
      {transferFrom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-bold mb-1">โอนย้ายกำลังพลทั้งหมด</h3>
            <p className="text-sm text-gray-500 mb-4">จาก: <strong>{transferFrom.name}</strong></p>
            <form onSubmit={handleBulkTransfer} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หน่วยงานปลายทาง</label>
                <select value={targetOrgId} onChange={e => setTargetOrgId(Number(e.target.value))}
                  className={inputCls} required>
                  <option value="">-- เลือกหน่วยงาน --</option>
                  {orgs.filter(o => o.id !== transferFrom.id && o.is_active).map(o => (
                    <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm hover:bg-orange-700">
                  โอนย้ายทั้งหมด
                </button>
                <button type="button" onClick={() => { setTransferFrom(null); setTargetOrgId("") }}
                  className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
