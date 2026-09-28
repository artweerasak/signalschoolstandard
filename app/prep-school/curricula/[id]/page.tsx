/**
 * app/prep-school/curricula/[id]/page.tsx
 * รายละเอียดหลักสูตร — จัดการวิชาย่อย (เฉพาะสถานะร่าง) + ส่งต่อแผนกเตรียมพล
 */
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api, CurriculumDetail, Course, PersonnelSearchRow } from "@/lib/api"

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", submitted: "ส่งให้แผนกเตรียมพลแล้ว", active: "ใช้งาน", closed: "ปิดรุ่น",
}

const RANK_CHOICES = [
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

interface EditForm {
  name: string
  batch_code: string
  academic_year: number
  start_date: string
  end_date: string
  eligible_rank_min: string
  eligible_rank_max: string
  eligible_min_years_in_rank: string
  eligible_personnel_type: string
  eligible_rank_class: string
  category: string
  eligible_prerequisite_categories: string[]
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

export default function CurriculumDetailPage() {
  const params = useParams()
  const curriculumId = Number(params.id)
  const router = useRouter()

  const [curriculum, setCurriculum] = useState<CurriculumDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(EMPTY_COURSE_FORM)
  const [savingCourse, setSavingCourse] = useState(false)
  const [courseFormError, setCourseFormError] = useState("")
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [courseQuery, setCourseQuery] = useState("")
  const [courseResults, setCourseResults] = useState<Course[]>([])
  const [searchingCourses, setSearchingCourses] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState("")
  const [deleting, setDeleting] = useState(false)

  const [assigningCourseId, setAssigningCourseId] = useState<number | null>(null)
  const [instructorQuery, setInstructorQuery] = useState("")
  const [instructorResults, setInstructorResults] = useState<PersonnelSearchRow[]>([])
  const [searchingInstructor, setSearchingInstructor] = useState(false)
  const [savingInstructor, setSavingInstructor] = useState(false)
  const [instructorError, setInstructorError] = useState("")

  const load = () => {
    setLoading(true)
    api.getCurriculum(curriculumId)
      .then(setCurriculum)
      .catch(() => setError("ไม่พบหลักสูตรนี้ หรือคุณไม่มีสิทธิ์เข้าถึง"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (curriculumId) load() }, [curriculumId])

  const isDraft = curriculum?.status === "draft"
  const canAddCourse = curriculum?.status === "draft" || curriculum?.status === "submitted" || curriculum?.status === "active"

  const openAddCourse = () => {
    setCourseForm(EMPTY_COURSE_FORM)
    setCourseFormError("")
    setSelectedCourse(null)
    setCourseQuery("")
    setCourseResults([])
    setShowCourseModal(true)
  }

  // ค้นหารายวิชาจากคลังวิชาในระบบ (debounce 300ms) แทนการให้พิมพ์ course_id เอง
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
      await api.addCurriculumCourse(curriculumId, {
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
    if (!confirm("ยืนยันการลบวิชานี้ออกจากหลักสูตร?")) return
    try {
      await api.removeCurriculumCourse(curriculumId, coursePk)
      load()
    } catch {
      setError("ไม่สามารถลบวิชาได้")
    }
  }

  const handleSubmit = async () => {
    if (!curriculum || curriculum.courses.length === 0) {
      alert("ต้องมีอย่างน้อย 1 วิชาก่อนส่งให้แผนกเตรียมพล")
      return
    }
    if (!confirm("ยืนยันส่งหลักสูตรนี้ให้แผนกเตรียมพล? หลังส่งแล้วจะแก้ไขวิชาไม่ได้")) return
    setSubmitting(true)
    try {
      await api.submitCurriculum(curriculumId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ")
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = () => {
    if (!curriculum) return
    setEditForm({
      name: curriculum.name,
      batch_code: curriculum.batch_code,
      academic_year: curriculum.academic_year,
      start_date: curriculum.start_date || "",
      end_date: curriculum.end_date || "",
      eligible_rank_min: curriculum.eligible_rank_min,
      eligible_rank_max: curriculum.eligible_rank_max,
      eligible_min_years_in_rank: curriculum.eligible_min_years_in_rank != null ? String(curriculum.eligible_min_years_in_rank) : "",
      eligible_personnel_type: curriculum.eligible_personnel_type,
      eligible_rank_class: curriculum.eligible_rank_class,
      category: curriculum.category,
      eligible_prerequisite_categories: curriculum.eligible_prerequisite_categories,
      quota_total: curriculum.quota_total,
    })
    setEditError("")
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm) return
    if (!editForm.name.trim()) { setEditError("กรุณากรอกชื่อหลักสูตร"); return }
    if (!editForm.batch_code.trim()) { setEditError("กรุณากรอกรุ่นที่"); return }
    if (editForm.start_date && editForm.end_date && editForm.start_date > editForm.end_date) {
      setEditError("วันเริ่มหลักสูตรต้องไม่หลังวันจบหลักสูตร"); return
    }
    setSavingEdit(true)
    setEditError("")
    try {
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        batch_code: editForm.batch_code.trim(),
        academic_year: editForm.academic_year,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
      }
      if (isDraft) {
        Object.assign(body, {
          eligible_rank_min: editForm.eligible_rank_min,
          eligible_rank_max: editForm.eligible_rank_max,
          eligible_min_years_in_rank: editForm.eligible_min_years_in_rank ? Number(editForm.eligible_min_years_in_rank) : null,
          eligible_personnel_type: editForm.eligible_personnel_type,
          eligible_rank_class: editForm.eligible_rank_class,
          category: editForm.category,
          eligible_prerequisite_categories: editForm.eligible_prerequisite_categories,
          quota_total: editForm.quota_total,
        })
      }
      await api.updateCurriculum(curriculumId, body)
      setShowEditModal(false)
      load()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`ยืนยันลบหลักสูตร "${curriculum?.name}" ทิ้งทั้งหมด? ลบแล้วกู้คืนไม่ได้ (ลบได้เฉพาะสถานะร่างเท่านั้น)`)) return
    setDeleting(true)
    setError("")
    try {
      await api.deleteCurriculum(curriculumId)
      router.push("/prep-school")
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ")
      setDeleting(false)
    }
  }

  const openAssignInstructor = (courseId: number) => {
    setAssigningCourseId(courseId)
    setInstructorQuery("")
    setInstructorResults([])
    setInstructorError("")
  }

  useEffect(() => {
    if (assigningCourseId === null || !instructorQuery.trim()) { setInstructorResults([]); return }
    const t = setTimeout(() => {
      setSearchingInstructor(true)
      api.searchPersonnel({ q: instructorQuery.trim(), role: "instructor", page_size: 20 })
        .then(r => setInstructorResults(r.results))
        .catch(() => setInstructorResults([]))
        .finally(() => setSearchingInstructor(false))
    }, 300)
    return () => clearTimeout(t)
  }, [instructorQuery, assigningCourseId])

  const handlePickInstructor = async (person: PersonnelSearchRow) => {
    if (assigningCourseId === null) return
    setSavingInstructor(true)
    setInstructorError("")
    try {
      await api.setCourseInstructor(curriculumId, assigningCourseId, person.id)
      setAssigningCourseId(null)
      load()
    } catch (err) {
      setInstructorError(err instanceof Error ? err.message : "มอบหมายไม่สำเร็จ")
    } finally {
      setSavingInstructor(false)
    }
  }

  const handleRemoveInstructor = async (courseId: number) => {
    if (!confirm("ยืนยันถอดผู้สอนคนนี้ออกจากวิชานี้?")) return
    try {
      await api.removeCourseInstructor(curriculumId, courseId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ถอดผู้สอนไม่สำเร็จ")
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!curriculum) return null

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/prep-school" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1A6B]">{curriculum.name}</h1>
            <p className="text-sm text-[#6b6478] mt-1">รุ่น {curriculum.batch_code} · ปีการศึกษา {curriculum.academic_year}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openEdit}
              className="border border-[#d9d2e6] text-[#4A1A6B] hover:bg-[#f7f5fa] text-sm font-medium px-4 py-2.5 rounded-lg">
              แก้ไขข้อมูล
            </button>
            {isDraft && (
              <button onClick={handleDelete} disabled={deleting}
                className="border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                {deleting ? "กำลังลบ..." : "ลบหลักสูตร"}
              </button>
            )}
            {isDraft && (
              <button onClick={handleSubmit} disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50">
                {submitting ? "กำลังส่ง..." : "ส่งให้แผนกเตรียมพล →"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-[#9a92a8] text-xs">สถานะ</p>
          <p className="font-medium mt-0.5">{STATUS_LABELS[curriculum.status] || curriculum.status}</p>
        </div>
        <div>
          <p className="text-[#9a92a8] text-xs">หน่วยงาน</p>
          <p className="font-medium mt-0.5">{curriculum.organization_name || "-"}</p>
        </div>
        <div>
          <p className="text-[#9a92a8] text-xs">โควตารวม</p>
          <p className="font-medium mt-0.5">{curriculum.quota_total}</p>
        </div>
        <div>
          <p className="text-[#9a92a8] text-xs">ระยะเวลาหลักสูตร</p>
          <p className="font-medium mt-0.5">
            {curriculum.start_date || curriculum.end_date
              ? `${curriculum.start_date ?? "?"} – ${curriculum.end_date ?? "?"}`
              : "ไม่ระบุ"}
          </p>
        </div>
        <div>
          <p className="text-[#9a92a8] text-xs">ประเภทหลักสูตร</p>
          <p className="font-medium mt-0.5">{curriculum.category_display || "ไม่ระบุ"}</p>
        </div>
        <div className="col-span-2 md:col-span-4">
          <p className="text-[#9a92a8] text-xs">คุณสมบัติผู้เข้าเรียน</p>
          <p className="font-medium mt-0.5">
            {curriculum.eligible_rank_min_display || curriculum.eligible_rank_max_display
              ? `ยศ ${curriculum.eligible_rank_min_display || "ไม่จำกัด"} – ${curriculum.eligible_rank_max_display || "ไม่จำกัด"}`
              : "ไม่จำกัดช่วงยศ"}
            {curriculum.eligible_min_years_in_rank ? ` · ครองยศมาแล้วอย่างน้อย ${curriculum.eligible_min_years_in_rank} ปี` : ""}
            {curriculum.eligible_personnel_type_display ? ` · ${curriculum.eligible_personnel_type_display}` : ""}
          </p>
          {curriculum.eligible_prerequisite_categories_display.length > 0 && (
            <p className="text-sm text-[#4a4456] mt-1">
              ต้องผ่านมาก่อน: {curriculum.eligible_prerequisite_categories_display.join(", ")}
            </p>
          )}
          {curriculum.eligible_rank_class && (
            <p className="text-xs text-[#9a92a8] mt-1">หมายเหตุ: {curriculum.eligible_rank_class}</p>
          )}
        </div>
      </div>

      {!isDraft && (
        <p className="text-xs text-[#9a92a8]">
          แก้ไขได้เฉพาะชื่อ/รุ่น/ปี/ระยะเวลาหลักสูตร — เกณฑ์คุณสมบัติ/ประเภทหลักสูตร/โควตา แก้ไขได้เฉพาะตอนสถานะร่างเท่านั้น
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#2D0F42]">วิชาในหลักสูตร ({curriculum.courses.length})</h2>
        {canAddCourse && (
          <button onClick={openAddCourse}
            className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg">
            + เพิ่มวิชา
          </button>
        )}
      </div>

      {!isDraft && curriculum.status !== "closed" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          หลักสูตรนี้ส่งให้แผนกเตรียมพลไปแล้ว — เพิ่มวิชาใหม่ได้ตามปกติ แต่ถ้ามีกำลังพลที่บรรจุเข้าหลักสูตรนี้ไปแล้วบางส่วน
          ต้องแจ้งแผนกเตรียมพลให้กดปุ่ม &ldquo;ตามให้ครบ&rdquo; เพื่อลงทะเบียนวิชาใหม่ให้คนกลุ่มนั้นด้วย (ระบบไม่ลงทะเบียนให้อัตโนมัติ)
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
        {curriculum.courses.length === 0 ? (
          <div className="py-12 text-center text-[#9a92a8] text-sm">ยังไม่มีวิชาในหลักสูตรนี้</div>
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
                <th className="px-4 py-3">ผู้สอน</th>
                {isDraft && <th className="px-4 py-3">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {curriculum.courses.map(c => (
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
                    {c.owner_name ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[#2D0F42]">{c.owner_name}</span>
                        {canAddCourse && (
                          <>
                            <button onClick={() => openAssignInstructor(c.id)} className="text-[#4A1A6B] hover:underline text-xs">เปลี่ยน</button>
                            <button onClick={() => handleRemoveInstructor(c.id)} className="text-red-500 hover:underline text-xs">ถอด</button>
                          </>
                        )}
                      </div>
                    ) : canAddCourse ? (
                      <button onClick={() => openAssignInstructor(c.id)}
                        className="text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
                        ⚠️ ยังไม่ได้มอบหมาย — มอบหมายผู้สอน
                      </button>
                    ) : (
                      <span className="text-xs text-[#9a92a8]">ยังไม่ได้มอบหมาย</span>
                    )}
                  </td>
                  {isDraft && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleRemoveCourse(c.id)} className="text-red-500 hover:underline text-xs font-medium">
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assigningCourseId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">มอบหมายผู้สอน</h3>
              <button onClick={() => setAssigningCourseId(null)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {instructorError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{instructorError}</div>
              )}
              <p className="text-xs text-[#9a92a8]">ค้นหาจากรายชื่อผู้ใช้ที่มีสิทธิ์ครูอาจารย์ (role=instructor) ในระบบเท่านั้น</p>
              <input type="text" placeholder="พิมพ์ชื่ออาจารย์ที่ต้องการค้นหา..." value={instructorQuery}
                onChange={e => setInstructorQuery(e.target.value)} autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                {searchingInstructor ? (
                  <p className="px-3 py-2 text-sm text-[#9a92a8]">กำลังค้นหา...</p>
                ) : !instructorQuery.trim() ? (
                  <p className="px-3 py-2 text-sm text-[#9a92a8]">พิมพ์ชื่อเพื่อค้นหา</p>
                ) : instructorResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-[#9a92a8]">ไม่พบอาจารย์ที่ตรงกับคำค้นหา (ต้องมี role=instructor ในระบบก่อน)</p>
                ) : (
                  instructorResults.map(p => (
                    <button type="button" key={p.id} disabled={savingInstructor} onClick={() => handlePickInstructor(p)}
                      className="w-full text-left px-3 py-2 hover:bg-[#f7f5fa] text-sm disabled:opacity-50">
                      <p className="font-medium text-[#2D0F42]">{p.full_name}</p>
                      <p className="text-xs text-[#9a92a8]">{p.organization_name || p.unit}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCourseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">เพิ่มวิชาในหลักสูตร</h3>
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

      {showEditModal && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">แก้ไขข้อมูลหลักสูตร</h3>
              <button onClick={() => setShowEditModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {editError && (
                <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-3 py-2 rounded-xl text-sm">{editError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อหลักสูตร</label>
                <input type="text" value={editForm.name}
                  onChange={e => setEditForm(f => f && { ...f, name: e.target.value })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">รุ่นที่</label>
                  <input type="text" value={editForm.batch_code}
                    onChange={e => setEditForm(f => f && { ...f, batch_code: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">ปีการศึกษา (พ.ศ.)</label>
                  <input type="number" value={editForm.academic_year}
                    onChange={e => setEditForm(f => f && { ...f, academic_year: Number(e.target.value) })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันเริ่มหลักสูตร</label>
                  <input type="date" value={editForm.start_date}
                    onChange={e => setEditForm(f => f && { ...f, start_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันจบหลักสูตร</label>
                  <input type="date" value={editForm.end_date}
                    onChange={e => setEditForm(f => f && { ...f, end_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>

              {isDraft ? (
                <div className="border-t border-[#e6e1ee] pt-4 space-y-3">
                  <p className="text-sm font-semibold text-[#2D0F42]">เกณฑ์คุณสมบัติ/ประเภทหลักสูตร/โควตา</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศต่ำสุด</label>
                      <select value={editForm.eligible_rank_min}
                        onChange={e => setEditForm(f => f && { ...f, eligible_rank_min: e.target.value })}
                        className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                        <option value="">ไม่จำกัด</option>
                        {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศสูงสุด</label>
                      <select value={editForm.eligible_rank_max}
                        onChange={e => setEditForm(f => f && { ...f, eligible_rank_max: e.target.value })}
                        className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                        <option value="">ไม่จำกัด</option>
                        {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[#4a4456] mb-1">ระยะเวลาครองยศขั้นต่ำ (ปี)</label>
                      <input type="number" min={0} placeholder="ไม่จำกัด" value={editForm.eligible_min_years_in_rank}
                        onChange={e => setEditForm(f => f && { ...f, eligible_min_years_in_rank: e.target.value })}
                        className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทบุคลากร</label>
                      <select value={editForm.eligible_personnel_type}
                        onChange={e => setEditForm(f => f && { ...f, eligible_personnel_type: e.target.value })}
                        className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                        <option value="">ทุกประเภท</option>
                        {PERSONNEL_TYPE_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">หลักสูตรนี้เป็นประเภท</label>
                    <select value={editForm.category}
                      onChange={e => setEditForm(f => f && { ...f, category: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                      <option value="">— ไม่ระบุ —</option>
                      {CURRICULUM_CATEGORY_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ต้องผ่านหลักสูตรประเภทใดมาก่อน</label>
                    <div className="flex flex-wrap gap-2">
                      {CURRICULUM_CATEGORY_CHOICES.map(([code, label]) => {
                        const checked = editForm.eligible_prerequisite_categories.includes(code)
                        return (
                          <label key={code} className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${
                            checked ? "bg-[#4A1A6B] text-white border-[#4A1A6B]" : "bg-white text-[#4a4456] border-[#d9d2e6]"
                          }`}>
                            <input type="checkbox" className="hidden" checked={checked}
                              onChange={() => setEditForm(f => f && {
                                ...f,
                                eligible_prerequisite_categories: checked
                                  ? f.eligible_prerequisite_categories.filter(c => c !== code)
                                  : [...f.eligible_prerequisite_categories, code],
                              })} />
                            {label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>
                    <input type="text" value={editForm.eligible_rank_class}
                      onChange={e => setEditForm(f => f && { ...f, eligible_rank_class: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">โควตารวม</label>
                    <input type="number" value={editForm.quota_total}
                      onChange={e => setEditForm(f => f && { ...f, quota_total: Number(e.target.value) })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#9a92a8] border-t border-[#e6e1ee] pt-3">
                  เกณฑ์คุณสมบัติ/ประเภทหลักสูตร/โควตา แก้ไขได้เฉพาะตอนสถานะร่างเท่านั้น
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm text-[#6b6478] hover:text-[#2D0F42]">
                ยกเลิก
              </button>
              <button onClick={handleSaveEdit} disabled={savingEdit}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
