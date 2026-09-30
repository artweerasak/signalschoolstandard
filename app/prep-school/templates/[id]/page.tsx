/**
 * app/prep-school/templates/[id]/page.tsx
 * แก้ไขแม่แบบหลักสูตร — เกณฑ์คุณสมบัติ + จัดการวิชา ไม่มี status/submit/quota
 * workflow เพราะไม่ใช่หลักสูตรที่เปิดจริง เป็นแค่พิมพ์เขียวไว้คัดลอก
 */
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api, Course, CurriculumTemplateDetail, PrerequisiteCategoryRequirement } from "@/lib/api"
import Button from "@/components/ui/Button"

// ต้องตรงกับ CURRICULUM_RANK_CHOICES/PERSONNEL_TYPE_CHOICES/... ใน
// military_curriculum/models.py เป๊ะ (ชุดเดียวกับ app/prep-school/page.tsx และ
// app/prep-school/curricula/[id]/page.tsx)
const RANK_CHOICES = [
  ["NNS","นนส. (นักเรียนนายสิบ)"],
  ["PVT","พลทหาร"],["CPL","สิบตรี"],["SGT3","สิบโท"],["SGT2","สิบเอก"],
  ["SSGT","จ่าสิบตรี"],["MSGT","จ่าสิบโท"],["CSGT","จ่าสิบเอก"],["CSGT_S","จ่าสิบเอกพิเศษ"],
  ["WO1","พันจ่าตรี"],["WO2","พันจ่าโท"],["WO3","พันจ่าเอก"],
  ["2LT","ร้อยตรี"],["1LT","ร้อยโท"],["CPT","ร้อยเอก"],
  ["MAJ","พันตรี"],["LTCOL","พันโท"],["COL","พันเอก"],["COL_S","พันเอกพิเศษ"],
  ["BGEN","พลตรี"],["MGEN","พลโท"],["GEN","พลเอก"],
]
const PERSONNEL_TYPE_CHOICES = [
  ["military", "ทหาร"], ["civilian", "ลูกจ้างประจำ"], ["government", "พนักงานราชการ"],
]
const CURRICULUM_CATEGORY_CHOICES = [
  ["nco_basic", "นายสิบชั้นต้น"],
  ["nco_senior", "นายสิบชั้นสูง (อาวุโส)"],
  ["officer_company", "นายทหารสัญญาบัตร ชั้นนายร้อย"],
  ["officer_field", "นายทหารสัญญาบัตร ชั้นนายพัน"],
  ["officer_senior", "นายทหารสัญญาบัตร ชั้นนายพล/เสนาธิการ"],
  ["other", "อื่นๆ"],
]
const TRAINING_PURPOSE_CHOICES = [
  ["production", "หลักสูตรผลิต"],
  ["career_track", "หลักสูตรตามแนวทางรับราชการ"],
  ["skill_enrichment", "หลักสูตรเพิ่มพูนความรู้"],
  ["special_external_budget", "หลักสูตรพิเศษ (ใช้งบประมาณจากภายนอก)"],
]
const ELIGIBLE_BRANCH_CHOICES = [
  ["signal", "เหล่า ส."],
  ["any", "ไม่จำกัดเหล่า"],
  ["unspecified", "ไม่ระบุ"],
]

interface EditForm {
  name: string
  eligible_rank_min: string
  eligible_rank_max: string
  eligible_branch: string
  eligible_personnel_type: string[]
  eligible_rank_class: string[]
  category: string
  training_purpose: string
  eligible_prerequisite_categories: PrerequisiteCategoryRequirement[]
  quota_total: number
}

interface CourseForm {
  course_id: string
  display_name: string
  credit_hours: number
  credits: number
  assessment_type: "score" | "pass_fail"
  passing_score: number | ""
  is_required: boolean
}
const EMPTY_COURSE_FORM: CourseForm = {
  course_id: "", display_name: "", credit_hours: 0, credits: 0,
  assessment_type: "score", passing_score: "", is_required: true,
}

export default function CurriculumTemplateDetailPage() {
  const params = useParams()
  const templateId = Number(params.id)
  const router = useRouter()

  const [template, setTemplate] = useState<CurriculumTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saved, setSaved] = useState(false)

  const [showCourseModal, setShowCourseModal] = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(EMPTY_COURSE_FORM)
  const [savingCourse, setSavingCourse] = useState(false)
  const [courseFormError, setCourseFormError] = useState("")
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [courseQuery, setCourseQuery] = useState("")
  const [courseResults, setCourseResults] = useState<Course[]>([])
  const [searchingCourses, setSearchingCourses] = useState(false)

  const load = () => {
    setLoading(true)
    api.getTemplate(templateId)
      .then(t => {
        setTemplate(t)
        setForm({
          name: t.name,
          eligible_rank_min: t.eligible_rank_min,
          eligible_rank_max: t.eligible_rank_max,
          eligible_branch: t.eligible_branch,
          eligible_personnel_type: t.eligible_personnel_type,
          eligible_rank_class: t.eligible_rank_class,
          category: t.category,
          training_purpose: t.training_purpose,
          eligible_prerequisite_categories: t.eligible_prerequisite_categories,
          quota_total: t.quota_total,
        })
      })
      .catch(() => setError("ไม่พบแม่แบบนี้ หรือคุณไม่มีสิทธิ์เข้าถึง"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (templateId) load() }, [templateId])

  const handleSave = async () => {
    if (!form) return
    if (!form.name.trim()) { setSaveError("กรุณากรอกชื่อแม่แบบ"); return }
    setSaving(true)
    setSaveError("")
    setSaved(false)
    try {
      const updated = await api.updateTemplate(templateId, {
        ...form,
        name: form.name.trim(),
        eligible_rank_class: form.eligible_rank_class.filter(item => item.trim()),
      })
      setTemplate(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`ยืนยันลบแม่แบบ "${template?.name}" ทิ้งทั้งหมด? ลบแล้วกู้คืนไม่ได้`)) return
    setDeleting(true)
    setError("")
    try {
      await api.deleteTemplate(templateId)
      router.push("/prep-school/templates")
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ")
      setDeleting(false)
    }
  }

  const openAddCourse = () => {
    setCourseForm(EMPTY_COURSE_FORM)
    setCourseFormError("")
    setSelectedCourse(null)
    setCourseQuery("")
    setCourseResults([])
    setShowCourseModal(true)
  }

  useEffect(() => {
    if (!showCourseModal || selectedCourse || !courseQuery.trim()) {
      setCourseResults([])
      return
    }
    const t = setTimeout(() => {
      setSearchingCourses(true)
      api.courses(courseQuery)
        .then(r => setCourseResults(r.results))
        .catch(() => setCourseResults([]))
        .finally(() => setSearchingCourses(false))
    }, 300)
    return () => clearTimeout(t)
  }, [courseQuery, showCourseModal, selectedCourse])

  const pickCourse = (c: Course) => {
    setSelectedCourse(c)
    setCourseForm(f => ({ ...f, course_id: c.id, display_name: c.name }))
    setCourseResults([])
    setCourseQuery("")
  }

  const clearSelectedCourse = () => {
    setSelectedCourse(null)
    setCourseForm(f => ({ ...f, course_id: "", display_name: "" }))
  }

  const handleSaveCourse = async () => {
    if (!selectedCourse) { setCourseFormError("กรุณาค้นหาและเลือกวิชาจากระบบ"); return }
    if (!courseForm.display_name.trim()) { setCourseFormError("กรุณากรอกชื่อวิชา"); return }
    setSavingCourse(true)
    setCourseFormError("")
    try {
      await api.addTemplateCourse(templateId, {
        ...courseForm,
        passing_score: courseForm.passing_score === "" ? undefined : Number(courseForm.passing_score),
      })
      setShowCourseModal(false)
      load()
    } catch (err) {
      setCourseFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSavingCourse(false)
    }
  }

  const handleRemoveCourse = async (coursePk: number) => {
    if (!confirm("ยืนยันการลบวิชานี้ออกจากแม่แบบ?")) return
    try {
      await api.removeTemplateCourse(templateId, coursePk)
      load()
    } catch {
      setError("ไม่สามารถลบวิชาได้")
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!template || !form) return null

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/prep-school/templates" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการแม่แบบ</Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1A6B]">{template.name}</h1>
            <p className="text-sm text-[#6b6478] mt-1">แม่แบบหลักสูตร — ไม่ใช่หลักสูตรที่เปิดจริง ใช้สำหรับสร้างหลักสูตรปี/รุ่นใหม่</p>
          </div>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "กำลังลบ..." : "ลบแม่แบบ"}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{saveError}</div>
      )}
      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อแม่แบบ</label>
          <input type="text" value={form.name}
            onChange={e => setForm(f => f && { ...f, name: e.target.value })}
            className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
        </div>

        <div className="border-t border-[#e6e1ee] pt-4">
          <p className="text-sm font-semibold text-[#2D0F42] mb-3">คุณสมบัติผู้เข้าเรียน (ไม่บังคับ)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศต่ำสุด</label>
              <select value={form.eligible_rank_min}
                onChange={e => setForm(f => f && { ...f, eligible_rank_min: e.target.value })}
                className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                <option value="">ไม่จำกัด</option>
                {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศสูงสุด</label>
              <select value={form.eligible_rank_max}
                onChange={e => setForm(f => f && { ...f, eligible_rank_max: e.target.value })}
                className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                <option value="">ไม่จำกัด</option>
                {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#4a4456] mb-1">เหล่า</label>
            <select value={form.eligible_branch}
              onChange={e => setForm(f => f && { ...f, eligible_branch: e.target.value })}
              className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
              <option value="">— ไม่ระบุ —</option>
              {ELIGIBLE_BRANCH_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทบุคลากร (เลือกได้หลายข้อ)</label>
            <div className="flex flex-wrap gap-2">
              {PERSONNEL_TYPE_CHOICES.map(([code, label]) => {
                const checked = form.eligible_personnel_type.includes(code)
                return (
                  <label key={code} className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${
                    checked ? "bg-[#4A1A6B] text-white border-[#4A1A6B]" : "bg-white text-[#4a4456] border-[#d9d2e6]"
                  }`}>
                    <input type="checkbox" className="hidden" checked={checked}
                      onChange={() => setForm(f => f && {
                        ...f,
                        eligible_personnel_type: checked
                          ? f.eligible_personnel_type.filter(c => c !== code)
                          : [...f.eligible_personnel_type, code],
                      })} />
                    {label}
                  </label>
                )
              })}
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#4a4456] mb-1">คุณสมบัติผู้รับการฝึกอบรม (รายข้อ ไม่บังคับ)</label>
            <div className="space-y-2">
              {form.eligible_rank_class.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={item} placeholder="เช่น ผ่านการฝึกภาคสนามมาก่อน"
                    onChange={e => setForm(f => f && {
                      ...f,
                      eligible_rank_class: f.eligible_rank_class.map((v, vi) => vi === i ? e.target.value : v),
                    })}
                    className="flex-1 border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  <button type="button"
                    onClick={() => setForm(f => f && {
                      ...f, eligible_rank_class: f.eligible_rank_class.filter((_, vi) => vi !== i),
                    })}
                    className="text-[#9a92a8] hover:text-[#b91c1c] px-2">✕</button>
                </div>
              ))}
              <button type="button"
                onClick={() => setForm(f => f && { ...f, eligible_rank_class: [...f.eligible_rank_class, ""] })}
                className="text-xs text-[#4A1A6B] font-medium hover:underline">+ เพิ่มคุณสมบัติ</button>
            </div>
          </div>
        </div>

        <div className="border-t border-[#e6e1ee] pt-4">
          <p className="text-sm font-semibold text-[#2D0F42] mb-3">ประเภทหลักสูตร (ไม่บังคับ)</p>
          <div>
            <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทหลักสูตร (แผนกเตรียมการ)</label>
            <select value={form.training_purpose}
              onChange={e => setForm(f => f && { ...f, training_purpose: e.target.value })}
              className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
              <option value="">— ไม่ระบุ —</option>
              {TRAINING_PURPOSE_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#4a4456] mb-1">หลักสูตรนี้เป็นประเภท (สำหรับจับคู่ prerequisite)</label>
            <select value={form.category}
              onChange={e => setForm(f => f && { ...f, category: e.target.value })}
              className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
              <option value="">— ไม่ระบุ —</option>
              {CURRICULUM_CATEGORY_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#4a4456] mb-1">ต้องผ่านหลักสูตรประเภทใดมาก่อน</label>
            <div className="space-y-2">
              {CURRICULUM_CATEGORY_CHOICES.map(([code, label]) => {
                const entry = form.eligible_prerequisite_categories.find(p => p.category === code)
                const checked = !!entry
                return (
                  <div key={code} className="flex items-center gap-2">
                    <label className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${
                      checked ? "bg-[#4A1A6B] text-white border-[#4A1A6B]" : "bg-white text-[#4a4456] border-[#d9d2e6]"
                    }`}>
                      <input type="checkbox" className="hidden" checked={checked}
                        onChange={() => setForm(f => f && {
                          ...f,
                          eligible_prerequisite_categories: checked
                            ? f.eligible_prerequisite_categories.filter(p => p.category !== code)
                            : [...f.eligible_prerequisite_categories, { category: code, min_years_since: null }],
                        })} />
                      {label}
                    </label>
                    {checked && (
                      <input type="number" min={0} placeholder="ผ่านมาแล้วกี่ปี (ไม่บังคับ)"
                        value={entry?.min_years_since ?? ""}
                        onChange={e => {
                          const v = e.target.value === "" ? null : Number(e.target.value)
                          setForm(f => f && {
                            ...f,
                            eligible_prerequisite_categories: f.eligible_prerequisite_categories.map(p =>
                              p.category === code ? { ...p, min_years_since: v } : p
                            ),
                          })
                        }}
                        className="w-44 border border-[#d9d2e6] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#4a4456] mb-1">ยอดผู้เข้ารับการฝึกอบรมตามแผน (ค่าแนะนำ)</label>
            <input type="number" value={form.quota_total}
              onChange={e => setForm(f => f && { ...f, quota_total: Number(e.target.value) })}
              className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          </div>
        </div>

        <div className="border-t border-[#e6e1ee] pt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกแม่แบบ"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">บันทึกแล้ว</span>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#2D0F42]">วิชาในแม่แบบ ({template.courses.length})</h2>
        <button onClick={openAddCourse}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg">
          + เพิ่มวิชา
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
        {template.courses.length === 0 ? (
          <div className="py-12 text-center text-[#9a92a8] text-sm">ยังไม่มีวิชาในแม่แบบนี้</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">ลำดับ</th>
                <th className="px-4 py-3">ชื่อวิชา</th>
                <th className="px-4 py-3">Course ID</th>
                <th className="px-4 py-3">ชั่วโมง</th>
                <th className="px-4 py-3">หน่วยกิต</th>
                <th className="px-4 py-3">การวัดผล</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {template.courses.map(c => (
                <tr key={c.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3 text-[#6b6478]">{c.sequence_order}</td>
                  <td className="px-4 py-3 font-medium">{c.display_name} {c.is_required && <span className="text-xs text-red-500 ml-1">*บังคับ</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#6b6478]">{c.course_id}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.credit_hours}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.credits}</td>
                  <td className="px-4 py-3 text-[#6b6478]">
                    {c.assessment_type === "score" ? `คะแนน (ผ่าน ${c.passing_score ?? "-"})` : "ผ่าน/ไม่ผ่าน"}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRemoveCourse(c.id)} className="text-red-500 hover:underline text-xs font-medium">
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCourseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">เพิ่มวิชาในแม่แบบ</h3>
              <button onClick={() => setShowCourseModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {courseFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{courseFormError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">รายวิชา (ค้นหาจากระบบ)</label>
                {selectedCourse ? (
                  <div className="flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-[#f7f5fa]">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#2D0F42] truncate">{selectedCourse.name}</p>
                      <p className="text-xs text-[#9a92a8] font-mono truncate">{selectedCourse.id}</p>
                    </div>
                    <button type="button" onClick={clearSelectedCourse}
                      className="text-xs text-[#4A1A6B] hover:underline shrink-0">เปลี่ยน</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" placeholder="พิมพ์ชื่อวิชาที่ต้องการค้นหา..." value={courseQuery}
                      onChange={e => setCourseQuery(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    {courseQuery.trim() && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {searchingCourses ? (
                          <p className="px-3 py-2 text-sm text-[#9a92a8]">กำลังค้นหา...</p>
                        ) : courseResults.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-[#9a92a8]">ไม่พบวิชาที่ตรงกับคำค้นหา</p>
                        ) : (
                          courseResults.map(c => (
                            <button type="button" key={c.id} onClick={() => pickCourse(c)}
                              className="w-full text-left px-3 py-2 hover:bg-[#f7f5fa] text-sm border-b border-gray-100 last:border-0">
                              <p className="font-medium text-[#2D0F42]">{c.name}</p>
                              <p className="text-xs text-[#9a92a8] font-mono">{c.id}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อวิชา (แสดงในหลักสูตร)</label>
                <input type="text" value={courseForm.display_name}
                  onChange={e => setCourseForm({ ...courseForm, display_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">จำนวนชั่วโมง</label>
                  <input type="number" value={courseForm.credit_hours}
                    onChange={e => setCourseForm({ ...courseForm, credit_hours: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">หน่วยกิต</label>
                  <input type="number" value={courseForm.credits}
                    onChange={e => setCourseForm({ ...courseForm, credits: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทการวัดผล</label>
                <select value={courseForm.assessment_type}
                  onChange={e => setCourseForm({ ...courseForm, assessment_type: e.target.value as "score" | "pass_fail" })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                  <option value="score">คะแนน/เกรด</option>
                  <option value="pass_fail">ผ่าน/ไม่ผ่าน</option>
                </select>
              </div>
              {courseForm.assessment_type === "score" && (
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">คะแนนผ่าน (ไม่บังคับ)</label>
                  <input type="number" value={courseForm.passing_score}
                    onChange={e => setCourseForm({ ...courseForm, passing_score: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_required" checked={courseForm.is_required}
                  onChange={e => setCourseForm({ ...courseForm, is_required: e.target.checked })}
                  className="w-4 h-4 accent-[#4A1A6B]" />
                <label htmlFor="is_required" className="text-sm text-[#4a4456]">วิชาบังคับ</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <button onClick={() => setShowCourseModal(false)} className="px-4 py-2 text-sm text-[#6b6478] hover:text-[#2D0F42]">
                ยกเลิก
              </button>
              <button onClick={handleSaveCourse} disabled={savingCourse}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {savingCourse ? "กำลังบันทึก..." : "เพิ่มวิชา"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
