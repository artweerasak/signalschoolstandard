"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { api, Course } from "@/lib/api"

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://studio-signalstandard.rta.mi.th"

export default function InstructorCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.instructorCourses()
      .then((r) => setCourses(r.results))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#4A1A6B]">หลักสูตรที่ฉันสอน</h2>
          <p className="text-sm text-gray-500 mt-0.5">หลักสูตรทั้งหมด {courses.length} หลักสูตร</p>
        </div>
        <a
          href={STUDIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#4A1A6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7B3FA0] transition-colors"
        >
          <span>🏫</span> Open edX Studio
        </a>
      </div>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg px-4 py-3 text-sm mb-6">
          ⚠️ ไม่สามารถดึงข้อมูลจาก Open edX ได้: {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-6 text-sm text-blue-800">
        <p className="font-semibold mb-1">💡 การสร้างหลักสูตรใหม่</p>
        <p>ใช้ <strong>Open edX Studio</strong> (ปุ่มด้านบนขวา) เพื่อสร้างและแก้ไขเนื้อหาหลักสูตร
        หลังจากสร้างแล้ว หลักสูตรจะแสดงในหน้านี้อัตโนมัติ</p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📚</p>
          <p className="text-lg font-medium text-gray-600">ยังไม่มีหลักสูตร</p>
          <p className="text-sm mt-1">ไปที่ Open edX Studio เพื่อสร้างหลักสูตรแรกของคุณ</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((course) => (
            <div key={course.id} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-32 bg-gradient-to-br from-[#4A1A6B] to-[#7B3FA0] flex items-center justify-center">
                <span className="text-4xl">📡</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{course.name}</h3>
                <p className="text-gray-500 text-xs mb-3 line-clamp-2">{course.short_description}</p>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  <span>👥 {course.enrollment_count} คน</span>
                  {course.effort && <span>⏱ {course.effort}</span>}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/instructor/courses/${encodeURIComponent(course.id)}`}
                    className="flex-1 bg-[#4A1A6B] text-white text-center py-2 rounded-lg text-xs font-medium hover:bg-[#7B3FA0] transition-colors"
                  >
                    ดูนักเรียน / คะแนน
                  </Link>
                  <a
                    href={`${STUDIO_URL}/course/${course.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    แก้ไข
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
