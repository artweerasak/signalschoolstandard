/**
 * app/my/courses/page.tsx
 * หน้าค้นหาและเลือกหลักสูตร — เหมือน ThaiMOOC homepage
 * ดึงข้อมูลจาก Open edX /api/courses/v1/courses/ โดยตรง
 */
"use client"

import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import { api, Course } from "@/lib/api"

// ── หมวดหมู่ (categories) ────────────────────────────────────────────────
const CATEGORIES = [
  { key: "",              label: "ทั้งหมด", icon: "📚" },
  { key: "การสื่อสาร",    label: "การสื่อสาร", icon: "📡" },
  { key: "อุปกรณ์สื่อสาร", label: "อุปกรณ์", icon: "🔧" },
  { key: "ไซเบอร์",       label: "ไซเบอร์", icon: "🛡️" },
  { key: "การเข้ารหัส",   label: "การเข้ารหัส", icon: "🔐" },
  { key: "เครือข่าย",     label: "เครือข่าย", icon: "🌐" },
  { key: "การบังคับบัญชา", label: "C2", icon: "⭐" },
]

// ── Course Card ───────────────────────────────────────────────────────────
function CourseCard({ course, onEnroll }: { course: Course; onEnroll: (id: string) => void }) {
  const isOpen = !course.enrollment_end ||
    new Date(course.enrollment_end) > new Date()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      {/* Banner image */}
      <div className="h-40 bg-gradient-to-br from-[#4A1A6B] to-[#7B3FA0] relative flex items-center justify-center">
        {course.course_image_url ? (
          <Image src={course.course_image_url} alt={course.name} fill className="object-cover" />
        ) : (
          <div className="text-center px-4">
            <p className="text-white/40 text-5xl mb-1">📡</p>
            <p className="text-[#C9A84C] text-xs font-semibold tracking-widest uppercase">
              {course.org}
            </p>
          </div>
        )}
        {/* Category badge */}
        <span className="absolute top-3 left-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
          {course.category}
        </span>
        {/* Enrolled badge */}
        {course.is_enrolled && (
          <span className="absolute top-3 right-3 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
            ✓ ลงทะเบียนแล้ว
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-bold text-gray-800 text-sm leading-snug line-clamp-2">
          {course.name}
        </h3>
        <p className="text-gray-500 text-xs mt-2 line-clamp-2 flex-1">
          {course.short_description}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
          {course.effort && <span>⏱ {course.effort}</span>}
          <span>👥 {course.enrollment_count} คน</span>
        </div>

        {/* Action */}
        <div className="mt-4">
          {course.is_enrolled ? (
            <a
              href={`/edx/courses/${course.id}/courseware`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              เข้าเรียน →
            </a>
          ) : isOpen ? (
            <button
              onClick={() => onEnroll(course.id)}
              className="w-full bg-[#C9A84C] hover:bg-[#b8942f] text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              ลงทะเบียน
            </button>
          ) : (
            <button disabled className="w-full bg-gray-100 text-gray-400 text-sm py-2 rounded-lg cursor-not-allowed">
              ปิดรับสมัคร
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [category, setCategory] = useState("")
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [enrollMsg, setEnrollMsg] = useState("")

  const loadCourses = useCallback(() => {
    setLoading(true)
    api.courses(search, category)
      .then((res) => setCourses(res.results))
      .finally(() => setLoading(false))
  }, [search, category])

  useEffect(() => { loadCourses() }, [loadCourses])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  async function handleEnroll(courseId: string) {
    setEnrolling(courseId)
    setEnrollMsg("")
    try {
      const res = await fetch(`/edx/api/enrollment/v1/enrollment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_details: { course_id: courseId } }),
      })
      if (res.ok) {
        setEnrollMsg("✅ ลงทะเบียนสำเร็จ!")
        setCourses(prev => prev.map(c => c.id === courseId ? { ...c, is_enrolled: true, enrollment_count: c.enrollment_count + 1 } : c))
      } else {
        setEnrollMsg("❌ ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่")
      }
    } catch {
      setEnrollMsg("❌ ไม่สามารถเชื่อมต่อ server ได้")
    }
    setEnrolling(null)
    setTimeout(() => setEnrollMsg(""), 3000)
  }

  const enrolledCount = courses.filter(c => c.is_enrolled).length

  return (
    <div className="space-y-6">

      {/* Hero search bar */}
      <div className="bg-gradient-to-r from-[#2D0F42] via-[#4A1A6B] to-[#7B3FA0] rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-1">ค้นหาหลักสูตร</h2>
        <p className="text-purple-200 text-sm mb-5">
          หลักสูตรของกรมการทหารสื่อสาร · ลงทะเบียนเรียนได้ทันที
        </p>
        <div className="relative max-w-lg">
          <input
            type="text"
            placeholder="ค้นหาชื่อหลักสูตร..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
          />
          <span className="absolute left-3 top-3 text-white/50">🔍</span>
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-3 text-white/50 hover:text-white"
            >✕</button>
          )}
        </div>
      </div>

      {/* Flash message */}
      {enrollMsg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${enrollMsg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {enrollMsg}
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>พบ <strong className="text-[#4A1A6B]">{courses.length}</strong> หลักสูตร</span>
          {enrolledCount > 0 && (
            <span className="bg-green-50 text-green-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
              ลงทะเบียนแล้ว {enrolledCount} หลักสูตร
            </span>
          )}
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${category === cat.key
                ? "bg-[#4A1A6B] text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-[#4A1A6B] hover:text-[#4A1A6B]"
              }`}
          >
            <span>{cat.icon}</span>{cat.label}
          </button>
        ))}
      </div>

      {/* Course grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
              <div className="h-40 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="h-8 bg-gray-100 rounded-lg mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-5xl mb-3">🔍</p>
          <p className="text-gray-500 font-medium">ไม่พบหลักสูตรที่ค้นหา</p>
          <button onClick={() => { setSearchInput(""); setCategory("") }}
            className="mt-3 text-[#4A1A6B] text-sm underline">ล้างตัวกรอง</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => (
            <div key={course.id} className={enrolling === course.id ? "opacity-60 pointer-events-none" : ""}>
              <CourseCard course={course} onEnroll={handleEnroll} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
