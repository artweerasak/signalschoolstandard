"use client"
import { useEffect, useState } from "react"
import { api, AdminCourse, AdminCourseInstructor } from "@/lib/api"

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://studio-signalstandard.rta.mi.th"

interface InstructorUser {
  id: number
  username: string
  full_name: string
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [assignModal, setAssignModal] = useState<AdminCourse | null>(null)
  const [instructorUsers, setInstructorUsers] = useState<InstructorUser[]>([])
  const [assigning, setAssigning] = useState(false)

  const loadCourses = () => {
    setLoading(true)
    api.adminCourses()
      .then((r) => setCourses(r.results))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadCourses() }, [])

  // โหลด instructor users เมื่อเปิด assign modal
  useEffect(() => {
    if (!assignModal) return
    api.adminUsers()
      .then((r) => {
        const instructors = r.results.filter((u: any) => u.role === "instructor" || u.role === "admin")
        setInstructorUsers(instructors.map((u: any) => ({
          id: u.id,
          username: u.username,
          full_name: u.full_name || u.username,
        })))
      })
      .catch(() => {})
  }, [assignModal])

  const handleDelete = async (courseId: string) => {
    setDeleting(courseId)
    try {
      await api.adminDeleteCourse(courseId)
      setCourses((prev) => prev.filter((c) => c.id !== courseId))
      setConfirmDelete(null)
    } catch (err: any) {
      alert("ลบ course ไม่สำเร็จ: " + err.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleAssign = async (courseId: string, userId: number, action: "add" | "remove") => {
    setAssigning(true)
    try {
      await api.adminAssignInstructor(courseId, userId, action)
      loadCourses()
      // อัปเดต modal ด้วย
      const updated = await api.adminCourses()
      const updatedCourse = updated.results.find((c) => c.id === courseId)
      if (updatedCourse) setAssignModal(updatedCourse)
    } catch (err: any) {
      alert("ไม่สำเร็จ: " + err.message)
    } finally {
      setAssigning(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <svg className="animate-spin h-10 w-10 text-[#4A1A6B]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#4A1A6B]">จัดการหลักสูตร</h2>
          <p className="text-sm text-gray-500 mt-0.5">หลักสูตรทั้งหมด {courses.length} หลักสูตร</p>
        </div>
        <a
          href={STUDIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#4A1A6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7B3FA0] transition-colors"
        >
          <span>🏫</span> สร้าง course ใหม่ใน Studio
        </a>
      </div>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg px-4 py-3 text-sm mb-6">
          ⚠️ {error}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📚</p>
          <p className="text-lg font-medium text-gray-600">ยังไม่มีหลักสูตร</p>
          <p className="text-sm mt-1">ไปที่ Open edX Studio เพื่อสร้างหลักสูตรแรก</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((course) => (
            <div key={course.id} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-28 bg-gradient-to-br from-[#4A1A6B] to-[#7B3FA0] flex items-center justify-center">
                <span className="text-3xl">📡</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{course.name}</h3>
                <p className="text-gray-500 text-xs mb-3 line-clamp-2">{course.short_description}</p>

                {/* Instructors */}
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">ครูผู้สอน:</p>
                  {course.instructors.length === 0 ? (
                    <span className="text-xs text-orange-500">⚠️ ยังไม่มีครูผู้สอน</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {course.instructors.map((ins) => (
                        <span key={ins.user_id} className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                          {ins.full_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  <span>👥 {course.enrollment_count} คน</span>
                  {course.effort && <span>⏱ {course.effort}</span>}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setAssignModal(course)}
                    className="flex-1 bg-[#4A1A6B] text-white text-center py-2 rounded-lg text-xs font-medium hover:bg-[#7B3FA0] transition-colors"
                  >
                    👨‍🏫 มอบหมายครู
                  </button>
                  <a
                    href={`${STUDIO_URL}/course/${course.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
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
            </div>
          ))}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-600 mb-2">⚠️ ยืนยันการลบ course</h3>
            <p className="text-sm text-gray-600 mb-1 font-medium">
              {courses.find((c) => c.id === confirmDelete)?.name}
            </p>
            <p className="text-xs text-gray-400 mb-5">
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
                className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Instructor Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#4A1A6B]">👨‍🏫 มอบหมายครูผู้สอน</h3>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-4 font-medium">{assignModal.name}</p>

            {/* Current instructors */}
            {assignModal.instructors.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">ครูผู้สอนปัจจุบัน:</p>
                <div className="space-y-1">
                  {assignModal.instructors.map((ins) => (
                    <div key={ins.user_id} className="flex items-center justify-between bg-purple-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-purple-800">{ins.full_name} <span className="text-purple-400">({ins.username})</span></span>
                      <button
                        onClick={() => handleAssign(assignModal.id, ins.user_id, "remove")}
                        disabled={assigning}
                        className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50"
                      >
                        ลบออก
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add instructor */}
            <p className="text-xs text-gray-500 mb-2">เพิ่มครูผู้สอน:</p>
            <div className="overflow-y-auto flex-1 space-y-1">
              {instructorUsers
                .filter((u) => !assignModal.instructors.some((ins) => ins.user_id === u.id))
                .map((u) => (
                  <div key={u.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50">
                    <span className="text-sm text-gray-700">{u.full_name} <span className="text-gray-400">({u.username})</span></span>
                    <button
                      onClick={() => handleAssign(assignModal.id, u.id, "add")}
                      disabled={assigning}
                      className="text-[#4A1A6B] hover:text-[#7B3FA0] text-xs font-medium disabled:opacity-50"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                ))}
              {instructorUsers.filter((u) => !assignModal.instructors.some((ins) => ins.user_id === u.id)).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">ไม่มีครูที่สามารถเพิ่มได้</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
