/**
 * app/instructor/my-courses/page.tsx
 * วิชาในหลักสูตร (military_curriculum) ที่ผู้สอนเป็นเจ้าของ/ผู้ช่วยสอน
 * — แยกจาก /instructor (รายวิชา edX ที่ได้รับสิทธิ์ตรง) เพราะเป็นคนละระบบ
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, MyCurriculumCourseItem } from "@/lib/api"

export default function InstructorMyCoursesPage() {
  const [courses, setCourses] = useState<MyCurriculumCourseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.getMyCurriculumCourses()
      .then(r => setCourses(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2D0F42]">คะแนน / วิชาในหลักสูตร</h1>
        <p className="text-sm text-[#6b6478] mt-1">จัดการรายชื่อนักเรียน คะแนน และผู้ช่วยสอนของวิชาที่ท่านรับผิดชอบ</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : courses.length === 0 ? (
          <div className="py-16 text-center text-[#9a92a8]">ยังไม่มีวิชาในหลักสูตรที่ท่านรับผิดชอบ</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">ชื่อวิชา</th>
                <th className="px-4 py-3">หลักสูตร</th>
                <th className="px-4 py-3">บทบาท</th>
                <th className="px-4 py-3">จำนวนที่ตัดเกรดแล้ว</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3">
                    <Link href={`/instructor/my-courses/${c.id}`} className="text-[#4A1A6B] font-medium hover:underline">
                      {c.display_name}
                    </Link>
                    <p className="text-xs text-[#9a92a8] font-mono">{c.course_id}</p>
                  </td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.curriculum_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      c.is_owner ? "bg-purple-100 text-[#4A1A6B]" : "bg-[#f0ecf6] text-[#6b6478]"
                    }`}>
                      {c.is_owner ? "เจ้าของวิชา" : "ผู้ช่วยสอน"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.student_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
