/**
 * app/prep-school/templates/page.tsx
 * รายการแม่แบบหลักสูตร — บันทึกจากหลักสูตรที่ทำเสร็จแล้วปีนี้ ไว้สร้างหลักสูตร
 * ปี/รุ่นถัดไปได้โดยไม่ต้องแอดวิชาใหม่ทั้งหมด
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, CurriculumTemplateSummary } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"

export default function CurriculumTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<CurriculumTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)

  const [useModalFor, setUseModalFor] = useState<CurriculumTemplateSummary | null>(null)
  const [useForm, setUseForm] = useState({ name: "", batch_code: "", academic_year: new Date().getFullYear() + 543, start_date: "", end_date: "" })
  const [useSaving, setUseSaving] = useState(false)
  const [useError, setUseError] = useState("")

  const load = () => {
    setLoading(true)
    api.listTemplates()
      .then(r => setTemplates(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreateEmpty = async () => {
    const name = window.prompt("ชื่อแม่แบบใหม่")
    if (!name || !name.trim()) return
    setCreating(true)
    try {
      const t = await api.createTemplate({ name: name.trim() })
      router.push(`/prep-school/templates/${t.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างแม่แบบไม่สำเร็จ")
      setCreating(false)
    }
  }

  const openUseModal = (t: CurriculumTemplateSummary) => {
    setUseModalFor(t)
    setUseForm({ name: t.name, batch_code: "", academic_year: new Date().getFullYear() + 543, start_date: "", end_date: "" })
    setUseError("")
  }

  const handleCreateFromTemplate = async () => {
    if (!useModalFor) return
    if (!useForm.name.trim()) { setUseError("กรุณากรอกชื่อหลักสูตร"); return }
    if (!useForm.batch_code.trim()) { setUseError("กรุณากรอกรุ่นที่"); return }
    if (useForm.start_date && useForm.end_date && useForm.start_date > useForm.end_date) {
      setUseError("วันเริ่มหลักสูตรต้องไม่หลังวันจบหลักสูตร"); return
    }
    setUseSaving(true)
    setUseError("")
    try {
      const c = await api.createCurriculumFromTemplate(useModalFor.id, {
        name: useForm.name.trim(),
        batch_code: useForm.batch_code.trim(),
        academic_year: useForm.academic_year,
        start_date: useForm.start_date || null,
        end_date: useForm.end_date || null,
      })
      router.push(`/prep-school/curricula/${c.id}`)
    } catch (err) {
      setUseError(err instanceof Error ? err.message : "สร้างหลักสูตรไม่สำเร็จ")
      setUseSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="แม่แบบหลักสูตร"
        description="หลักสูตรที่เปิดซ้ำทุกปี/รุ่น เพียงแต่ต่างชื่อรุ่น/ปี — บันทึกวิชา+เกณฑ์คุณสมบัติไว้เป็นแม่แบบ แล้วสร้างหลักสูตรปีถัดไปได้โดยไม่ต้องแอดวิชาใหม่ทั้งหมด"
        action={<Button onClick={handleCreateEmpty} disabled={creating}>{creating ? "กำลังสร้าง..." : "+ สร้างแม่แบบเปล่าใหม่"}</Button>}
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : templates.length === 0 ? (
          <div className="py-16 text-center text-[#9a92a8]">
            <p className="text-lg mb-2">ยังไม่มีแม่แบบหลักสูตร</p>
            <p className="text-sm">เปิดหลักสูตรที่มีวิชาแล้วกด &ldquo;บันทึกเป็นแม่แบบ&rdquo; หรือสร้างแม่แบบเปล่าใหม่ที่นี่</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">ชื่อแม่แบบ</th>
                <th className="px-4 py-3">ประเภทหลักสูตร</th>
                <th className="px-4 py-3">จำนวนวิชา</th>
                <th className="px-4 py-3 w-56"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3">
                    <Link href={`/prep-school/templates/${t.id}`} className="text-[#4A1A6B] font-medium hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#6b6478]">{t.training_purpose_display || "-"}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{t.course_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" onClick={() => openUseModal(t)}>สร้างหลักสูตรจากแม่แบบนี้</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {useModalFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างหลักสูตรจาก &ldquo;{useModalFor.name}&rdquo;</h3>
              <button onClick={() => setUseModalFor(null)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-[#9a92a8]">
                วิชาทั้งหมด ({useModalFor.course_count} วิชา) และเกณฑ์คุณสมบัติจะถูกคัดลอกมาให้อัตโนมัติ
                — ปรับแก้ต่อได้ทันทีหลังสร้างเสร็จ
              </p>
              {useError && (
                <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-3 py-2 rounded-xl text-sm">{useError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อหลักสูตร</label>
                <input type="text" value={useForm.name}
                  onChange={e => setUseForm({ ...useForm, name: e.target.value })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">รุ่นที่</label>
                  <input type="text" value={useForm.batch_code}
                    onChange={e => setUseForm({ ...useForm, batch_code: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">ปีการศึกษา (พ.ศ.)</label>
                  <input type="number" value={useForm.academic_year}
                    onChange={e => setUseForm({ ...useForm, academic_year: Number(e.target.value) })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันเริ่มหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={useForm.start_date}
                    onChange={e => setUseForm({ ...useForm, start_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันจบหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={useForm.end_date}
                    onChange={e => setUseForm({ ...useForm, end_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setUseModalFor(null)}>ยกเลิก</Button>
              <Button onClick={handleCreateFromTemplate} disabled={useSaving}>
                {useSaving ? "กำลังสร้าง..." : "สร้างหลักสูตร"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
