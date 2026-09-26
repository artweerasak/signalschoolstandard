/**
 * app/prep-personnel/page.tsx
 * หลักสูตรที่ prep_school ส่งมาแล้ว — เปิดใช้งาน (activate) แล้วไปหน้าโควตา/บรรจุกำลังพล
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, SubmittedCurriculumItem } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_LABELS: Record<string, string> = { submitted: "รอเปิดใช้งาน", active: "ใช้งาน" }
const STATUS_TONES: Record<string, "warning" | "success"> = {
  submitted: "warning",
  active: "success",
}

export default function PrepPersonnelPage() {
  const [curricula, setCurricula] = useState<SubmittedCurriculumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activatingId, setActivatingId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    api.listSubmittedCurricula()
      .then(r => setCurricula(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleActivate = async (id: number) => {
    if (!confirm("ยืนยันเปิดใช้งานหลักสูตรนี้? หลังเปิดแล้วจะเริ่มบรรจุกำลังพลได้")) return
    setActivatingId(id)
    try {
      await api.activateCurriculum(id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปิดใช้งานไม่สำเร็จ")
    } finally {
      setActivatingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="หลักสูตรรอดำเนินการ"
        description="เปิดใช้งานหลักสูตรที่แผนกเตรียมการส่งมา แล้วบรรจุกำลังพลเข้าเรียน"
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : curricula.length === 0 ? (
          <div className="py-16 text-center text-[#9a92a8]">ยังไม่มีหลักสูตรที่ส่งมา</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">ชื่อหลักสูตร</th>
                <th className="px-4 py-3">หน่วยที่ส่ง</th>
                <th className="px-4 py-3">รุ่น/ปี</th>
                <th className="px-4 py-3">วิชา</th>
                <th className="px-4 py-3 w-40">บรรจุแล้ว / โควตา</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {curricula.map(c => (
                <tr key={c.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-[#6b6478] text-xs">{c.organization_name || "-"}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.batch_code} / {c.academic_year}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.course_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm ${c.enrolled_count > c.quota_total && c.quota_total > 0 ? "text-red-600 font-semibold" : "text-[#2D0F42]"}`}>
                        {c.enrolled_count} / {c.quota_total}
                      </span>
                    </div>
                    {c.quota_total > 0 && (
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div className={`h-1.5 rounded-full ${c.enrolled_count > c.quota_total ? "bg-red-500" : "bg-[#4A1A6B]"}`}
                          style={{ width: `${Math.min(100, Math.round((c.enrolled_count / c.quota_total) * 100))}%` }} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={STATUS_TONES[c.status] || "neutral"}>
                      {STATUS_LABELS[c.status] || c.status}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "submitted" ? (
                      <Button size="sm" onClick={() => handleActivate(c.id)} disabled={activatingId === c.id}>
                        {activatingId === c.id ? "กำลังเปิด..." : "เปิดใช้งาน"}
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Link href={`/prep-personnel/eligible-density/${c.id}`}
                          className="text-[#4A1A6B] hover:underline text-xs font-medium">
                          ความคับคั่งผู้มีสิทธิ์
                        </Link>
                        <span className="text-[#d9d2e6]">|</span>
                        <Link href={`/prep-personnel/quota-report/${c.id}`}
                          className="text-[#4A1A6B] hover:underline text-xs font-medium">
                          โควตา
                        </Link>
                        <span className="text-[#d9d2e6]">|</span>
                        <Link href={`/prep-personnel/enroll/${c.id}`}
                          className="text-[#4A1A6B] hover:underline text-xs font-medium">
                          บรรจุกำลังพล
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
