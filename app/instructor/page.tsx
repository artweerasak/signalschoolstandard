"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { api, Course } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://studio-signalstandard.rta.mi.th"

export default function InstructorCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    api.instructorCourses()
      .then((r) => setCourses(r.results))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (courseId: string) => {
    setDeleting(courseId)
    try {
      await api.deleteInstructorCourse(courseId)
      setCourses((prev) => prev.filter((c) => c.id !== courseId))
      setConfirmDelete(null)
    } catch (err: any) {
      alert("ลบ course ไม่สำเร็จ: " + err.message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-10 w-10 text-[#4A1A6B]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="หลักสูตรที่ฉันสอน"
        description={`หลักสูตรทั้งหมด ${courses.length} หลักสูตร`}
        action={
          <a href={STUDIO_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">🏫 Open edX Studio</Button>
          </a>
        }
      />

      {error && (
        <div className="bg-[#fef3c7] border border-[#fde68a] text-[#b45309] rounded-xl px-4 py-3 text-sm mb-6">
          ⚠️ ไม่สามารถดึงข้อมูลจาก Open edX ได้: {error}
        </div>
      )}

      <div className="bg-[#dbeafe] border border-blue-200 rounded-2xl px-5 py-4 mb-6 text-sm text-[#1d4ed8]">
        <p className="font-semibold mb-1">💡 การสร้างหลักสูตรใหม่</p>
        <p>ใช้ <strong>Open edX Studio</strong> (ปุ่มด้านบนขวา) เพื่อสร้างและแก้ไขเนื้อหาหลักสูตร
        หลังจากสร้างแล้ว หลักสูตรจะแสดงในหน้านี้อัตโนมัติ</p>
      </div>

      {courses.length === 0 ? (
        <Card className="p-12 text-center text-[#9a92a8]">
          <p className="text-4xl mb-3">📚</p>
          <p className="text-lg font-medium text-[#6b6478]">ยังไม่มีหลักสูตร</p>
          <p className="text-sm mt-1">ไปที่ Open edX Studio เพื่อสร้างหลักสูตรแรกของคุณ</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((course) => (
            <Card key={course.id} hoverable className="overflow-hidden">
              <div className="h-32 bg-gradient-to-br from-[#4A1A6B] to-[#7B3FA0] flex items-center justify-center">
                <span className="text-4xl">📡</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-[#2D0F42] mb-1 line-clamp-2">{course.name}</h3>
                <p className="text-[#6b6478] text-xs mb-3 line-clamp-2">{course.short_description}</p>
                <div className="flex items-center justify-between text-xs text-[#9a92a8] mb-4">
                  <span>👥 {course.enrollment_count} คน</span>
                  {course.effort && <span>⏱ {course.effort}</span>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={`/instructor/courses/${encodeURIComponent(course.id)}`}
                    className="flex-1 bg-[#4A1A6B] text-white text-center py-2 rounded-lg text-xs font-medium hover:bg-[#7B3FA0] transition-colors"
                  >
                    ดูนักเรียน / คะแนน
                  </Link>
                  <Link
                    href={`/instructor/courses/${encodeURIComponent(course.id)}?tab=prereq`}
                    className="px-3 py-2 border border-amber-300 rounded-lg text-xs text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    ⚙️ เงื่อนไข
                  </Link>
                  <a
                    href={`${STUDIO_URL}/course/${course.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-[#d9d2e6] rounded-lg text-xs text-[#6b6478] hover:bg-[#f7f5fa] transition-colors"
                  >
                    แก้ไข
                  </a>
                  <button
                    onClick={() => setConfirmDelete(course.id)}
                    className="px-3 py-2 border border-red-300 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-600 mb-2">⚠️ ยืนยันการลบ course</h3>
            <p className="text-sm text-[#6b6478] mb-1">
              {courses.find((c) => c.id === confirmDelete)?.name}
            </p>
            <p className="text-xs text-[#9a92a8] mb-5">
              การลบจะลบเนื้อหา การลงทะเบียน และคะแนนทั้งหมดอย่างถาวร
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={!!deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-[#d9d2e6] py-2 rounded-lg text-sm text-[#6b6478] hover:bg-[#f7f5fa]"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
