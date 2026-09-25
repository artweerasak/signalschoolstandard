/**
 * app/dashboard/course-requirements/page.tsx
 * กำหนดหลักสูตรที่แต่ละระดับชั้นต้องผ่าน
 */
"use client"

import { useEffect, useRef, useState } from "react"
import { api, CourseRequirement } from "@/lib/api"

const RANK_CLASS_OPTIONS = [
  { value: "nco",     label: "นายทหารประทวน" },
  { value: "officer", label: "นายทหารสัญญาบัตร" },
  { value: "pvt",     label: "พลทหาร" },
  { value: "civilian",   label: "ลูกจ้างประจำ" },
  { value: "government", label: "พนักงานราชการ" },
  { value: "all",     label: "ทุกระดับ" },
]

const RANK_CLASS_LABELS: Record<string, string> = Object.fromEntries(
  RANK_CLASS_OPTIONS.map((o) => [o.value, o.label])
)

interface CourseOption { id: string; name: string }

interface FormData {
  rank_class: string
  course_id: string
  course_name: string
  is_active: boolean
}

const EMPTY_FORM: FormData = { rank_class: "nco", course_id: "", course_name: "", is_active: true }

// ── Course Search Combobox ────────────────────────────────────────────
function CourseCombobox({
  courseId, courseName, onChange, disabled,
}: {
  courseId: string
  courseName: string
  onChange: (id: string, name: string) => void
  disabled?: boolean
}) {
  const [query, setQuery]           = useState(courseName || "")
  const [options, setOptions]       = useState<CourseOption[]>([])
  const [open, setOpen]             = useState(false)
  const [searching, setSearching]   = useState(false)
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef                     = useRef<HTMLDivElement>(null)

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  // sync ชื่อจาก prop เมื่อเปิด edit
  useEffect(() => { setQuery(courseName || "") }, [courseName])

  function handleInput(value: string) {
    setQuery(value)
    // ถ้า user พิมพ์เองให้ล้าง selection ก่อน
    onChange("", value)
    setOpen(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setOptions([]); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `/military/api/v1/admin/courses/?search=${encodeURIComponent(value)}&minimal=1`,
          { credentials: "include" }
        )
        const data = await res.json()
        setOptions(data.results ?? [])
      } catch {
        setOptions([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  function handleSelect(opt: CourseOption) {
    setQuery(opt.name)
    onChange(opt.id, opt.name)
    setOpen(false)
    setOptions([])
  }

  function handleFocus() {
    if (!query.trim()) {
      // โหลดทั้งหมดครั้งแรก
      setSearching(true)
      fetch("/military/api/v1/admin/courses/?minimal=1", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { setOptions(d.results ?? []); setOpen(true) })
        .catch(() => {})
        .finally(() => setSearching(false))
    } else {
      setOpen(true)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder="พิมพ์ชื่อหรือ ID หลักสูตรเพื่อค้นหา..."
          onChange={(e) => handleInput(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8
                     focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]
                     disabled:bg-gray-50 disabled:text-gray-400"
        />
        {searching && (
          <span className="absolute right-2.5 top-2.5 text-gray-400 text-xs animate-pulse">
            ⟳
          </span>
        )}
        {courseId && !searching && (
          <span className="absolute right-2.5 top-2.5 text-emerald-500 text-xs">✓</span>
        )}
      </div>

      {/* Selected course_id badge */}
      {courseId && (
        <p className="mt-1 text-xs font-mono text-purple-600 truncate">{courseId}</p>
      )}

      {/* Dropdown */}
      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg
                       max-h-56 overflow-y-auto text-sm">
          {options.map((opt) => (
            <li
              key={opt.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt) }}
              className={`px-3 py-2.5 cursor-pointer hover:bg-purple-50 ${
                opt.id === courseId ? "bg-purple-50 text-[#4A1A6B] font-medium" : "text-gray-700"
              }`}
            >
              <span className="block font-medium">{opt.name}</span>
              <span className="block text-xs text-gray-400 font-mono truncate">{opt.id}</span>
            </li>
          ))}
        </ul>
      )}

      {open && !searching && query.trim() && options.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow px-3 py-3 text-sm text-gray-400 text-center">
          ไม่พบหลักสูตรที่ตรงกัน
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function CourseRequirementsPage() {
  const [requirements, setRequirements] = useState<CourseRequirement[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState<CourseRequirement | null>(null)
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState("")
  const [formError, setFormError] = useState("")

  const load = () => {
    setLoading(true)
    api.courseRequirements()
      .then((r) => setRequirements(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  const openEdit = (item: CourseRequirement) => {
    setEditItem(item)
    setForm({
      rank_class:  item.rank_class,
      course_id:   item.course_id,
      course_name: item.course_name,
      is_active:   item.is_active,
    })
    setFormError("")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.course_id.trim())   { setFormError("กรุณาเลือกหลักสูตรจากรายการ"); return }
    if (!form.course_name.trim()) { setFormError("กรุณาระบุชื่อหลักสูตร"); return }
    setSaving(true)
    setFormError("")
    try {
      if (editItem) {
        await api.updateCourseRequirement(editItem.id, form)
      } else {
        await api.createCourseRequirement(form)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันการลบ?")) return
    try { await api.deleteCourseRequirement(id); load() }
    catch { setError("ไม่สามารถลบได้") }
  }

  const handleToggle = async (item: CourseRequirement) => {
    try { await api.updateCourseRequirement(item.id, { is_active: !item.is_active }); load() }
    catch { setError("ไม่สามารถอัปเดตได้") }
  }

  // group requirements by rank_class for display
  const grouped = RANK_CLASS_OPTIONS.map((o) => ({
    ...o,
    items: requirements.filter((r) => r.rank_class === o.value),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D0F42]">กำหนดหลักสูตรตามระดับชั้น</h2>
          <p className="text-sm text-gray-500 mt-1">กำหนดว่าระดับชั้นใดต้องผ่านหลักสูตรอะไรบ้าง</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + เพิ่มหลักสูตร
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">กำลังโหลด...</div>
      ) : requirements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center text-gray-400">
          <p className="text-lg mb-2">ยังไม่มีการกำหนดหลักสูตร</p>
          <p className="text-sm">คลิก &ldquo;+ เพิ่มหลักสูตร&rdquo; เพื่อเริ่มกำหนดมาตรฐาน</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.value} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                <span className="bg-[#4A1A6B] text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  {group.label}
                </span>
                <span className="text-xs text-gray-400">{group.items.length} หลักสูตร</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase">
                    <th className="px-5 py-2.5">ชื่อหลักสูตร</th>
                    <th className="px-5 py-2.5 hidden md:table-cell">Course ID</th>
                    <th className="px-5 py-2.5">สถานะ</th>
                    <th className="px-5 py-2.5">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-800 font-medium">{item.course_name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-400 hidden md:table-cell max-w-xs truncate">
                        {item.course_id}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleToggle(item)}
                          className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                            item.is_active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {item.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEdit(item)}
                            className="text-[#4A1A6B] hover:underline text-xs font-medium"
                          >
                            แก้ไข
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-red-400 hover:text-red-600 hover:underline text-xs font-medium"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">
                {editItem ? "แก้ไขหลักสูตร" : "เพิ่มหลักสูตรใหม่"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              {/* ระดับชั้น */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระดับชั้น</label>
                <select
                  value={form.rank_class}
                  onChange={(e) => setForm({ ...form, rank_class: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                >
                  {RANK_CLASS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Course Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค้นหาหลักสูตร
                  {!form.course_id && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">(พิมพ์เพื่อค้นหา หรือคลิกเพื่อดูทั้งหมด)</span>
                  )}
                </label>
                <CourseCombobox
                  courseId={form.course_id}
                  courseName={form.course_name}
                  onChange={(id, name) => setForm({ ...form, course_id: id, course_name: name })}
                />
              </div>

              {/* เปิด/ปิดใช้งาน */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 accent-[#4A1A6B]"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">เปิดใช้งาน</label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.course_id}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium
                           px-6 py-2 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
