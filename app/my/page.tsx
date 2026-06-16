/**
 * app/my/page.tsx
 * หน้าหลักของกำลังพล — แสดงข้อมูลส่วนตัว + สรุปใบประกาศ
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, MyProfile, MyCertificate, Course } from "@/lib/api"

const LMS_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://signalstandard.rta.mi.th"

function buildCourseUrl(courseId: string): string | null {
  if (!courseId?.trim()) return null
  if (!courseId.match(/^(course-v1|block-v1):/i)) return null
  const safeId = encodeURIComponent(courseId).replace(/%3A/gi, ":").replace(/%2B/gi, "+")
  return `${LMS_BASE}/courses/${safeId}/courseware`
}

function StatusBadge({ status, daysLeft }: { status: string; daysLeft: number | null }) {
  if (status === "expired") return (
    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">หมดอายุแล้ว</span>
  )
  if (status === "renewed") return (
    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">ต่ออายุแล้ว</span>
  )
  if (daysLeft !== null && daysLeft <= 30) return (
    <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">ใกล้หมดอายุ</span>
  )
  return (
    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">ใช้งานได้</span>
  )
}

export default function MyHomePage() {
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [certs, setCerts] = useState<MyCertificate[]>([])
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [entryError, setEntryError] = useState("")

  useEffect(() => {
    Promise.all([api.myProfile(), api.myCertificates(), api.courses()])
      .then(([p, c, courses]) => {
        setProfile(p)
        setCerts(c.results)
        setEnrolledCourses(courses.results.filter(c => c.is_enrolled))
      })
      .finally(() => setLoading(false))
  }, [])

  function handleEnterCourse(courseId: string) {
    if (!courseId?.match(/^(course-v1|block-v1):/i)) {
      setEntryError("รูปแบบ Course ID ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ")
      setTimeout(() => setEntryError(""), 6000)
      return
    }
    const isStaff = enrolledCourses.find(c => c.id === courseId)?.is_course_staff ?? false
    if (isStaff) {
      window.open(`/military/api/v1/goto-course/?course_id=${encodeURIComponent(courseId)}`, "_blank", "noopener,noreferrer")
    } else {
      const safeId = encodeURIComponent(courseId).replace(/%3A/gi, ":").replace(/%2B/gi, "+")
      window.open(`${LMS_BASE}/courses/${safeId}/courseware`, "_blank", "noopener,noreferrer")
    }
  }

  const expiredCount = certs.filter(c => c.status === "expired").length
  const nearExpiryCount = certs.filter(c => c.status === "active" && c.days_left !== null && c.days_left <= 30).length
  const activeCount = certs.filter(c => c.status === "active" && (c.days_left === null || c.days_left > 30)).length

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ยินดีต้อนรับ */}
      <div className="bg-gradient-to-r from-[#4A1A6B] to-[#7B3FA0] rounded-xl p-6 text-white">
        <p className="text-purple-200 text-sm">ยินดีต้อนรับเข้าสู่ระบบ</p>
        {loading ? (
          <div className="h-8 w-48 bg-white/20 rounded animate-pulse mt-1" />
        ) : (
          <h2 className="text-2xl font-bold mt-1">
            {profile?.rank_display} {profile?.full_name}
          </h2>
        )}
        <p className="text-purple-300 text-sm mt-1">{profile?.unit}</p>
        {profile?.service_years != null && (
          <p className="text-purple-200 text-xs mt-2">รับราชการมา {profile.service_years} ปี</p>
        )}
      </div>

      {/* แจ้งเตือน */}
      {(expiredCount > 0 || nearExpiryCount > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-yellow-800 text-sm">มีใบประกาศที่ต้องดำเนินการ</p>
            <ul className="text-yellow-700 text-sm mt-1 space-y-0.5">
              {expiredCount > 0 && <li>• หมดอายุแล้ว {expiredCount} รายการ — ต้องต่ออายุ</li>}
              {nearExpiryCount > 0 && <li>• ใกล้หมดอายุ {nearExpiryCount} รายการ (ภายใน 30 วัน)</li>}
            </ul>
            <Link href="/my/certificates" className="text-yellow-700 underline text-xs mt-2 inline-block">
              ดูรายละเอียด →
            </Link>
          </div>
        </div>
      )}

      {/* ลิงก์ค้นหาหลักสูตร */}
      <Link
        href="/my/courses"
        className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 hover:border-[#7B3FA0] hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📚</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">ค้นหาหลักสูตร</p>
            <p className="text-xs text-gray-400">ดูหลักสูตรทั้งหมดและลงทะเบียนเรียน</p>
          </div>
        </div>
        <span className="text-[#4A1A6B] group-hover:translate-x-1 transition-transform">→</span>
      </Link>

      {/* สรุปใบประกาศ */}
      <div>
        <h3 className="font-semibold text-[#2D0F42] mb-3">สรุปใบประกาศ</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-3xl font-bold text-green-600">{activeCount}</p>
            <p className="text-xs text-gray-500 mt-1">ใช้งานได้</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-3xl font-bold text-yellow-500">{nearExpiryCount}</p>
            <p className="text-xs text-gray-500 mt-1">ใกล้หมดอายุ</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-3xl font-bold text-red-500">{expiredCount}</p>
            <p className="text-xs text-gray-500 mt-1">หมดอายุแล้ว</p>
          </div>
        </div>
      </div>

      {/* ความคืบหน้าการเรียน */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-semibold text-[#4A1A6B]">📖 หลักสูตรที่ลงทะเบียนไว้</h3>
          <Link href="/my/courses" className="text-xs text-[#7B3FA0] hover:underline">ค้นหาหลักสูตร →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {loading ? (
            [...Array(2)].map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-2" />
                <div className="h-2 w-full bg-gray-100 rounded animate-pulse" />
              </div>
            ))
          ) : enrolledCourses.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-gray-400 text-sm">ยังไม่ได้ลงทะเบียนหลักสูตรใด</p>
              <Link href="/my/courses" className="text-[#4A1A6B] text-sm underline mt-2 inline-block">
                ค้นหาหลักสูตร →
              </Link>
            </div>
          ) : (
            enrolledCourses.slice(0, 5).map(c => {
              const cert = certs.find(ct => ct.course_id === c.id)
              const isPassed = cert && cert.status !== "expired"
              return (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-gray-800 truncate flex-1 mr-3">{c.name}</p>
                    {isPassed ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">ผ่านแล้ว ✓</span>
                    ) : (
                      <button
                        onClick={() => handleEnterCourse(c.id)}
                        className="text-xs text-[#4A1A6B] hover:underline shrink-0">เรียนต่อ →</button>
                    )}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${isPassed ? "bg-green-500 w-full" : "bg-[#7B3FA0] w-1/3"}`} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ใบประกาศล่าสุด */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-semibold text-[#4A1A6B]">📜 ใบประกาศของฉัน</h3>
          <Link href="/my/certificates" className="text-xs text-[#7B3FA0] hover:underline">ดูทั้งหมด →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex justify-between">
                <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
              </div>
            ))
          ) : certs.length === 0 ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">ยังไม่มีใบประกาศ</p>
          ) : (
            certs.map((cert) => (
              <div key={cert.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{cert.course_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {cert.expiry_date
                      ? `หมดอายุ: ${new Date(cert.expiry_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}`
                      : "ไม่มีวันหมดอายุ"}
                  </p>
                </div>
                <StatusBadge status={cert.status} daysLeft={cert.days_left} />
              </div>
            ))
          )}
        </div>
      </div>

      {entryError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-2">
          <span>⚠️</span>
          <span>{entryError}</span>
        </div>
      )}
    </div>
  )
}
