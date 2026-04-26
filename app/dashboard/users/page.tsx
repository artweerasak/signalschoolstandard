"use client"
import { useEffect, useState } from "react"
import { api, AdminUser } from "@/lib/api"

const RANK_CHOICES = [
  ["PVT","พลทหาร"],["CPL","สิบตรี"],["SGT3","สิบโท"],["SGT2","สิบเอก"],
  ["SSGT","จ่าสิบตรี"],["MSGT","จ่าสิบโท"],["CSGT","จ่าสิบเอก"],
  ["WO1","พันจ่าตรี"],["WO2","พันจ่าโท"],["WO3","พันจ่าเอก"],
  ["2LT","ร้อยตรี"],["1LT","ร้อยโท"],["CPT","ร้อยเอก"],
  ["MAJ","พันตรี"],["LTCOL","พันโท"],["COL","พันเอก"],
  ["BGEN","พลตรี"],["MGEN","พลโท"],["GEN","พลเอก"],
]

const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  instructor: "ครูอาจารย์",
  student: "กำลังพล",
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  instructor: "bg-blue-100 text-blue-700",
  student: "bg-green-100 text-green-700",
}

type FormData = {
  full_name_th: string; rank: string; unit: string; sub_unit: string;
  birth_date: string; service_start_date: string;
  email: string; username: string; password: string; role: string;
  national_id: string; military_id: string;
}

const emptyForm: FormData = {
  full_name_th: "", rank: "", unit: "", sub_unit: "",
  birth_date: "", service_start_date: "",
  email: "", username: "", password: "", role: "student",
  national_id: "", military_id: "",
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null)

  function loadUsers() {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search) params.search = search
    if (roleFilter) params.role = roleFilter
    api.adminUsers(params)
      .then((r) => { setUsers(r.results); setTotal(r.count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [search, roleFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditUser(null)
    setForm(emptyForm)
    setError("")
    setShowModal(true)
  }

  function openEdit(u: AdminUser) {
    setEditUser(u)
    setForm({
      full_name_th: u.full_name, rank: u.rank, unit: u.unit, sub_unit: u.sub_unit,
      birth_date: u.birth_date, service_start_date: u.service_start_date,
      email: u.email, username: u.username, password: "", role: u.role,
      national_id: "", military_id: "",
    })
    setError("")
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    setError("")
    try {
      if (editUser) {
        await api.adminUpdateUser(editUser.id, form)
        setSuccessMsg("แก้ไขข้อมูลเรียบร้อยแล้ว")
      } else {
        await api.adminCreateUser(form)
        setSuccessMsg("สร้างผู้ใช้เรียบร้อยแล้ว")
      }
      setShowModal(false)
      loadUsers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(u: AdminUser) {
    try {
      await api.adminDeactivateUser(u.id)
      setSuccessMsg("ปิดใช้งานผู้ใช้เรียบร้อยแล้ว")
      setConfirmDeactivate(null)
      loadUsers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#4A1A6B]">จัดการผู้ใช้</h2>
          <p className="text-sm text-gray-500 mt-0.5">ผู้ใช้ทั้งหมด {total} คน</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[#4A1A6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7B3FA0] transition-colors flex items-center gap-2"
        >
          <span>+</span> เพิ่มผู้ใช้
        </button>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4 flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-green-500">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="ค้นหาชื่อหรือหน่วย..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
        >
          <option value="">บทบาททั้งหมด</option>
          <option value="admin">ผู้ดูแลระบบ</option>
          <option value="instructor">ครูอาจารย์</option>
          <option value="student">กำลังพล</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">กำลังโหลด...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-400">ไม่พบข้อมูล</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3 text-left font-semibold">ชั้นยศ</th>
                <th className="px-4 py-3 text-left font-semibold">หน่วย</th>
                <th className="px-4 py-3 text-left font-semibold">บทบาท</th>
                <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-left font-semibold">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{u.full_name}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{u.rank_display}</td>
                  <td className="px-4 py-3 text-gray-700">{u.unit}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-[#4A1A6B] hover:underline text-xs font-medium"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`รีเซ็ตรหัสผ่านของ ${u.full_name} เป็นค่า default (เลขทหาร)?`)) return
                          try {
                            const res = await api.adminResetPassword(u.id)
                            setSuccessMsg(res.message)
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
                          }
                        }}
                        className="text-amber-600 hover:underline text-xs font-medium"
                      >
                        รีเซ็ตรหัสผ่าน
                      </button>
                      {u.is_active && (
                        <button
                          onClick={() => setConfirmDeactivate(u)}
                          className="text-red-500 hover:underline text-xs font-medium"
                        >
                          ปิดใช้งาน
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#4A1A6B]">
                {editUser ? "แก้ไขข้อมูลผู้ใช้" : "เพิ่มผู้ใช้ใหม่"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
              )}

              <Field label="ชื่อ-นามสกุล" required>
                <input type="text" value={form.full_name_th} onChange={e => setForm(f => ({...f, full_name_th: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="ชั้นยศ" required>
                  <select value={form.rank} onChange={e => setForm(f => ({...f, rank: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                    <option value="">เลือกยศ</option>
                    {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </Field>
                <Field label="บทบาท">
                  <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                    <option value="student">กำลังพล</option>
                    <option value="instructor">ครูอาจารย์</option>
                    <option value="admin">ผู้ดูแลระบบ</option>
                  </select>
                </Field>
              </div>

              <Field label="หน่วยต้นสังกัด" required>
                <input type="text" value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="วันเกิด">
                  <input type="date" value={form.birth_date} onChange={e => setForm(f => ({...f, birth_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </Field>
                <Field label="วันเริ่มรับราชการ">
                  <input type="date" value={form.service_start_date} onChange={e => setForm(f => ({...f, service_start_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </Field>
              </div>

              {!editUser && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Username" required>
                      <input type="text" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    </Field>
                    <Field label="Password">
                      <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))}
                        placeholder="(สุ่มอัตโนมัติ)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    </Field>
                  </div>
                  <Field label="อีเมล">
                    <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="เลขบัตรประชาชน" required>
                      <input type="text" value={form.national_id} onChange={e => setForm(f => ({...f, national_id: e.target.value.replace(/\D/g,"").slice(0,13)}))}
                        maxLength={13} placeholder="13 หลัก"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    </Field>
                    <Field label="เลขทหาร" required>
                      <input type="text" value={form.military_id} onChange={e => setForm(f => ({...f, military_id: e.target.value.replace(/\D/g,"").slice(0,10)}))}
                        maxLength={10} placeholder="10 หลัก"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    </Field>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#4A1A6B] text-white text-sm font-medium hover:bg-[#7B3FA0] disabled:opacity-60">
                {saving ? "กำลังบันทึก..." : editUser ? "บันทึกการแก้ไข" : "สร้างผู้ใช้"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirm */}
      {confirmDeactivate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการปิดใช้งาน</h3>
            <p className="text-gray-600 text-sm mb-6">
              ต้องการปิดใช้งานบัญชี <strong>{confirmDeactivate.full_name}</strong> ?
              <br />ผู้ใช้จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดใช้งานอีกครั้ง
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmDeactivate(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button onClick={() => handleDeactivate(confirmDeactivate)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                ยืนยัน ปิดใช้งาน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
