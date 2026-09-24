/**
 * app/prep-personnel/page.tsx
 * หลักสูตรที่ prep_school ส่งมาแล้ว — เปิดใช้งาน (activate) แล้วไปหน้าโควตา/บรรจุกำลังพล
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, SubmittedCurriculumItem } from "@/lib/api"

const STATUS_LABELS: Record<string, string> = { submitted: "รอเปิดใช้งาน", active: "ใช้งาน" }
const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-700",
  active: "bg-emerald-100 text-emerald-700",
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
      <div>
        <h1 className="text-2xl font-bold text-[#4A1A6B]">หลักสูตรรอดำเนินการ</h1>
        <p className="text-sm text-gray-500 mt-1">เปิดใช้งานหลักสูตรที่แผนกเตรียมการส่งมา แล้วบรรจุกำลังพลเข้าเรียน</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">กำลังโหลด...</div>
        ) : curricula.length === 0 ? (
          <div className="py-16 text-center text-gray-400">ยังไม่มีหลักสูตรที่ส่งมา</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3">ชื่อหลักสูตร</th>
                <th className="px-4 py-3">หน่วยที่ส่ง</th>
                <th className="px-4 py-3">รุ่น/ปี</th>
                <th className="px-4 py-3">วิชา</th>
                <th className="px-4 py-3">โควตา</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {curricula.map(c => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.organization_name || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.batch_code} / {c.academic_year}</td>
                  <td className="px-4 py-3 text-gray-600">{c.course_count}</td>
                  <td className="px-4 py-3 text-gray-600">{c.quota_total}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "submitted" ? (
                      <button onClick={() => handleActivate(c.id)} disabled={activatingId === c.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {activatingId === c.id ? "กำลังเปิด..." : "เปิดใช้งาน"}
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <Link href={`/prep-personnel/quota-report/${c.id}`}
                          className="text-[#4A1A6B] hover:underline text-xs font-medium">
                          โควตา
                        </Link>
                        <span className="text-gray-300">|</span>
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
      </div>
    </div>
  )
}
