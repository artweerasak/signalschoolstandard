/**
 * app/prep-school/page.tsx
 * รายการหลักสูตรประจำปี/รุ่น ของหน่วย — สร้าง/แก้ไข/ส่งต่อแผนกเตรียมพล
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, CurriculumSummary, CurriculumTemplateSummary, PrerequisiteCategoryRequirement } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ส่งให้แผนกเตรียมพลแล้ว",
  active: "ใช้งาน",
  closed: "ปิดรุ่น",
}
const STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "error"> = {
  draft: "neutral",
  submitted: "warning",
  active: "success",
  closed: "error",
}

// ต้องตรงกับ CURRICULUM_RANK_CHOICES/PERSONNEL_TYPE_CHOICES ใน
// military_curriculum/models.py + military_profile/models.py เป๊ะ — "นนส."
// เป็น choice เฉพาะของฟอร์มหลักสูตรเท่านั้น (ไม่ใช่ยศจริงของกำลังพล)
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
// ต้องตรงกับ CURRICULUM_CATEGORY_CHOICES ใน military_curriculum/models.py เป๊ะ
// — ใช้จับคู่ prerequisite เท่านั้น คนละเรื่องกับ TRAINING_PURPOSE_CHOICES
const CURRICULUM_CATEGORY_CHOICES = [
  ["nco_basic", "นายสิบชั้นต้น"],
  ["nco_senior", "นายสิบชั้นสูง (อาวุโส)"],
  ["officer_company", "นายทหารสัญญาบัตร ชั้นนายร้อย"],
  ["officer_field", "นายทหารสัญญาบัตร ชั้นนายพัน"],
  ["officer_senior", "นายทหารสัญญาบัตร ชั้นนายพล/เสนาธิการ"],
  ["other", "อื่นๆ"],
]
// ต้องตรงกับ TRAINING_PURPOSE_CHOICES ใน military_curriculum/models.py เป๊ะ
const TRAINING_PURPOSE_CHOICES = [
  ["production", "หลักสูตรผลิต"],
  ["career_track", "หลักสูตรตามแนวทางรับราชการ"],
  ["skill_enrichment", "หลักสูตรเพิ่มพูนความรู้"],
  ["special_external_budget", "หลักสูตรพิเศษ (ใช้งบประมาณจากภายนอก)"],
]
// ต้องตรงกับ ELIGIBLE_BRANCH_CHOICES ใน military_curriculum/models.py เป๊ะ
const ELIGIBLE_BRANCH_CHOICES = [
  ["signal", "เหล่า ส."],
  ["any", "ไม่จำกัดเหล่า"],
  ["unspecified", "ไม่ระบุ"],
]

interface FormData {
  name: string
  batch_code: string
  academic_year: number
  start_date: string
  end_date: string
  eligible_rank_class: string[]
  eligible_rank_min: string
  eligible_rank_max: string
  eligible_branch: string
  eligible_personnel_type: string[]
  category: string
  training_purpose: string
  eligible_prerequisite_categories: PrerequisiteCategoryRequirement[]
  quota_total: number
}
const EMPTY_FORM: FormData = {
  name: "", batch_code: "", academic_year: new Date().getFullYear() + 543,
  start_date: "", end_date: "",
  eligible_rank_class: [], eligible_rank_min: "", eligible_rank_max: "",
  eligible_branch: "", eligible_personnel_type: [],
  category: "", training_purpose: "", eligible_prerequisite_categories: [],
  quota_total: 0,
}

export default function PrepSchoolPage() {
  const router = useRouter()
  const [curricula, setCurricula] = useState<CurriculumSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [year, setYear] = useState<number | "all">("all")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkError, setBulkError] = useState("")

  const [templates, setTemplates] = useState<CurriculumTemplateSummary[]>([])
  const [showUseTemplateModal, setShowUseTemplateModal] = useState(false)
  const [useTemplateForm, setUseTemplateForm] = useState({
    template_id: 0, name: "", batch_code: "", academic_year: new Date().getFullYear() + 543,
    start_date: "", end_date: "",
  })
  const [useTemplateSaving, setUseTemplateSaving] = useState(false)
  const [useTemplateError, setUseTemplateError] = useState("")

  const load = () => {
    setLoading(true)
    api.listCurricula()
      .then(r => setCurricula(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ผตก. เสนอแผนการฝึกอบรมล่วงหน้า 1 ปี — ร่างปีถัดไปจะปนกับปีปัจจุบันในหน้า
  // เดียวกัน ถ้าไม่มีตัวกรอง จึงต้องมีแถบปีการศึกษาให้แยกดู (client-side filter
  // เหมือน pattern เดียวกับ app/org-admin/school-curricula/page.tsx)
  const years = useMemo(
    () => Array.from(new Set(curricula.map(c => c.academic_year))).sort((a, b) => b - a),
    [curricula]
  )
  const filtered = useMemo(
    () => (year === "all" ? curricula : curricula.filter(c => c.academic_year === year)),
    [curricula, year]
  )
  const selectableIds = useMemo(
    () => filtered.filter(c => c.status === "draft" && c.course_count > 0).map(c => c.id),
    [filtered]
  )

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  const openUseTemplate = () => {
    setUseTemplateError("")
    setUseTemplateForm({
      template_id: 0, name: "", batch_code: "", academic_year: new Date().getFullYear() + 543,
      start_date: "", end_date: "",
    })
    setShowUseTemplateModal(true)
    if (templates.length === 0) {
      api.listTemplates().then(r => setTemplates(r.results)).catch(() => {})
    }
  }

  const handleCreateFromTemplate = async () => {
    if (!useTemplateForm.template_id) { setUseTemplateError("กรุณาเลือกแม่แบบ"); return }
    if (!useTemplateForm.name.trim()) { setUseTemplateError("กรุณากรอกชื่อหลักสูตร"); return }
    if (!useTemplateForm.batch_code.trim()) { setUseTemplateError("กรุณากรอกรุ่นที่"); return }
    if (useTemplateForm.start_date && useTemplateForm.end_date && useTemplateForm.start_date > useTemplateForm.end_date) {
      setUseTemplateError("วันเริ่มหลักสูตรต้องไม่หลังวันจบหลักสูตร"); return
    }
    setUseTemplateSaving(true)
    setUseTemplateError("")
    try {
      const c = await api.createCurriculumFromTemplate(useTemplateForm.template_id, {
        name: useTemplateForm.name.trim(),
        batch_code: useTemplateForm.batch_code.trim(),
        academic_year: useTemplateForm.academic_year,
        start_date: useTemplateForm.start_date || null,
        end_date: useTemplateForm.end_date || null,
      })
      router.push(`/prep-school/curricula/${c.id}`)
    } catch (err) {
      setUseTemplateError(err instanceof Error ? err.message : "สร้างหลักสูตรไม่สำเร็จ")
      setUseTemplateSaving(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("กรุณากรอกชื่อหลักสูตร"); return }
    if (!form.batch_code.trim()) { setFormError("กรุณากรอกรุ่นที่"); return }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      setFormError("วันเริ่มหลักสูตรต้องไม่หลังวันจบหลักสูตร"); return
    }
    setSaving(true)
    setFormError("")
    try {
      await api.createCurriculum({
        ...form,
        eligible_rank_class: form.eligible_rank_class.filter(item => item.trim()),
      })
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleBulkSubmit = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`ต้องการส่งหลักสูตรที่เลือก ${selectedIds.length} รายการให้แผนกเตรียมพลใช่หรือไม่?`)) return
    setBulkSubmitting(true)
    setBulkError("")
    try {
      const result = await api.bulkSubmitCurricula(selectedIds)
      if (result.failed.length > 0) {
        setBulkError(`ส่งไม่สำเร็จ ${result.failed.length} รายการ: ${result.failed.map(f => f.error).join(", ")}`)
      }
      setSelectedIds([])
      load()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setBulkSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="หลักสูตรของหน่วย"
        description="สร้างกรอบหลักสูตรประจำปี/รุ่น แล้วส่งต่อแผนกเตรียมพลเพื่อบรรจุกำลังพล"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={openUseTemplate}>สร้างจากแม่แบบ</Button>
            <Button onClick={openAdd}>+ สร้างหลักสูตรใหม่</Button>
          </div>
        }
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}
      {bulkError && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{bulkError}</div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#6b6478]">ปีการศึกษา</label>
          <select
            value={year}
            onChange={e => { setYear(e.target.value === "all" ? "all" : Number(e.target.value)); setSelectedIds([]) }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
          >
            <option value="all">ทุกปีการศึกษา</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkSubmit} disabled={bulkSubmitting}>
            {bulkSubmitting ? "กำลังส่ง..." : `ส่งที่เลือก (${selectedIds.length})`}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[#9a92a8]">
            <p className="text-lg mb-2">ยังไม่มีหลักสูตร</p>
            <p className="text-sm">คลิก &ldquo;สร้างหลักสูตรใหม่&rdquo; เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">ชื่อหลักสูตร</th>
                <th className="px-4 py-3">รุ่น</th>
                <th className="px-4 py-3">ปีการศึกษา</th>
                <th className="px-4 py-3">จำนวนวิชา</th>
                <th className="px-4 py-3">ยอดตามแผน</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3">
                    {c.status === "draft" && c.course_count > 0 && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelected(c.id)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/prep-school/curricula/${c.id}`} className="text-[#4A1A6B] font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.batch_code}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.academic_year}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.course_count}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.quota_total}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={STATUS_TONES[c.status] || "neutral"}>
                      {STATUS_LABELS[c.status] || c.status}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างหลักสูตรใหม่</h3>
              <button onClick={() => setShowModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-3 py-2 rounded-xl text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อหลักสูตร</label>
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">รุ่นที่</label>
                  <input type="text" value={form.batch_code}
                    onChange={e => setForm({ ...form, batch_code: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">ปีการศึกษา (พ.ศ.)</label>
                  <input type="number" value={form.academic_year}
                    onChange={e => setForm({ ...form, academic_year: Number(e.target.value) })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันเริ่มหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันจบหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={form.end_date}
                    onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>

              <div className="border-t border-[#e6e1ee] pt-4">
                <p className="text-sm font-semibold text-[#2D0F42] mb-1">คุณสมบัติผู้เข้าเรียน (ไม่บังคับ)</p>
                <p className="text-xs text-[#9a92a8] mb-3">ใช้คำนวณจำนวนกำลังพลที่เข้าเกณฑ์ในรายงานความคับคั่งของแผนกเตรียมพล — เว้นว่างช่องไหน = ไม่จำกัดด้านนั้น</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศต่ำสุด</label>
                    <select value={form.eligible_rank_min}
                      onChange={e => setForm({ ...form, eligible_rank_min: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
                      <option value="">ไม่จำกัด</option>
                      {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศสูงสุด</label>
                    <select value={form.eligible_rank_max}
                      onChange={e => setForm({ ...form, eligible_rank_max: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
                      <option value="">ไม่จำกัด</option>
                      {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">เหล่า</label>
                  <select value={form.eligible_branch}
                    onChange={e => setForm({ ...form, eligible_branch: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
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
                            onChange={() => setForm(f => ({
                              ...f,
                              eligible_personnel_type: checked
                                ? f.eligible_personnel_type.filter(c => c !== code)
                                : [...f.eligible_personnel_type, code],
                            }))} />
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
                          onChange={e => setForm(f => ({
                            ...f,
                            eligible_rank_class: f.eligible_rank_class.map((v, vi) => vi === i ? e.target.value : v),
                          }))}
                          className="flex-1 border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                        <button type="button"
                          onClick={() => setForm(f => ({
                            ...f, eligible_rank_class: f.eligible_rank_class.filter((_, vi) => vi !== i),
                          }))}
                          className="text-[#9a92a8] hover:text-[#b91c1c] px-2">✕</button>
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, eligible_rank_class: [...f.eligible_rank_class, ""] }))}
                      className="text-xs text-[#4A1A6B] font-medium hover:underline">+ เพิ่มคุณสมบัติ</button>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#e6e1ee] pt-4">
                <p className="text-sm font-semibold text-[#2D0F42] mb-1">ประเภทหลักสูตร (ไม่บังคับ)</p>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทหลักสูตร (แผนกเตรียมการ)</label>
                  <select value={form.training_purpose}
                    onChange={e => setForm({ ...form, training_purpose: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
                    <option value="">— ไม่ระบุ —</option>
                    {TRAINING_PURPOSE_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </div>
                <p className="text-xs text-[#9a92a8] mt-3 mb-1">
                  ใช้จับคู่ว่าหลักสูตรนี้เป็นประเภทเดียวกับหลักสูตรอื่นไหม แม้ชื่อ/รุ่นจะต่างกันไปในแต่ละปี
                  (เช่น &ldquo;นายสิบชั้นต้นผ่านสื่อฯ&rdquo; กับ &ldquo;นายสิบชั้นต้นเร่งรัด&rdquo; เป็นประเภทเดียวกันได้) —
                  ใช้กับเงื่อนไข &ldquo;ต้องผ่านหลักสูตรประเภทนี้มาก่อน&rdquo; ของหลักสูตรอื่น คนละเรื่องกับด้านบน
                </p>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">หลักสูตรนี้เป็นประเภท (สำหรับจับคู่ prerequisite)</label>
                  <select value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
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
                              onChange={() => setForm(f => ({
                                ...f,
                                eligible_prerequisite_categories: checked
                                  ? f.eligible_prerequisite_categories.filter(p => p.category !== code)
                                  : [...f.eligible_prerequisite_categories, { category: code, min_years_since: null }],
                              }))} />
                            {label}
                          </label>
                          {checked && (
                            <input type="number" min={0} placeholder="ผ่านมาแล้วกี่ปี (ไม่บังคับ)"
                              value={entry?.min_years_since ?? ""}
                              onChange={e => {
                                const v = e.target.value === "" ? null : Number(e.target.value)
                                setForm(f => ({
                                  ...f,
                                  eligible_prerequisite_categories: f.eligible_prerequisite_categories.map(p =>
                                    p.category === code ? { ...p, min_years_since: v } : p
                                  ),
                                }))
                              }}
                              className="w-44 border border-[#d9d2e6] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ยอดผู้เข้ารับการฝึกอบรมตามแผน</label>
                <input type="number" value={form.quota_total}
                  onChange={e => setForm({ ...form, quota_total: Number(e.target.value) })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                ยกเลิก
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showUseTemplateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างหลักสูตรจากแม่แบบ</h3>
              <button onClick={() => setShowUseTemplateModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {useTemplateError && (
                <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-3 py-2 rounded-xl text-sm">{useTemplateError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">แม่แบบ</label>
                {templates.length === 0 ? (
                  <p className="text-sm text-[#9a92a8]">
                    ยังไม่มีแม่แบบหลักสูตร — สร้างได้จากหน้า{" "}
                    <Link href="/prep-school/templates" className="text-[#4A1A6B] hover:underline">แม่แบบหลักสูตร</Link>
                  </p>
                ) : (
                  <select value={useTemplateForm.template_id}
                    onChange={e => {
                      const id = Number(e.target.value)
                      const t = templates.find(x => x.id === id)
                      setUseTemplateForm(f => ({ ...f, template_id: id, name: t ? t.name : f.name }))
                    }}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                    <option value={0}>— เลือกแม่แบบ —</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.course_count} วิชา)</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อหลักสูตร</label>
                <input type="text" value={useTemplateForm.name}
                  onChange={e => setUseTemplateForm({ ...useTemplateForm, name: e.target.value })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">รุ่นที่</label>
                  <input type="text" value={useTemplateForm.batch_code}
                    onChange={e => setUseTemplateForm({ ...useTemplateForm, batch_code: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">ปีการศึกษา (พ.ศ.)</label>
                  <input type="number" value={useTemplateForm.academic_year}
                    onChange={e => setUseTemplateForm({ ...useTemplateForm, academic_year: Number(e.target.value) })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันเริ่มหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={useTemplateForm.start_date}
                    onChange={e => setUseTemplateForm({ ...useTemplateForm, start_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันจบหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={useTemplateForm.end_date}
                    onChange={e => setUseTemplateForm({ ...useTemplateForm, end_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <p className="text-xs text-[#9a92a8]">วิชาทั้งหมดและเกณฑ์คุณสมบัติจะถูกคัดลอกมาให้อัตโนมัติ — ปรับแก้ต่อได้ทันทีหลังสร้างเสร็จ</p>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowUseTemplateModal(false)}>ยกเลิก</Button>
              <Button onClick={handleCreateFromTemplate} disabled={useTemplateSaving}>
                {useTemplateSaving ? "กำลังสร้าง..." : "สร้างหลักสูตร"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
