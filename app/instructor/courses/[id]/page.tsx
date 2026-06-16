"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api, InstructorStudent, InstructorGrade } from "@/lib/api"

type Tab = "students" | "grades" | "prereq"

// ระดับบุคลากร (rank_class) สำหรับกำหนดการมองเห็นหลักสูตรตามเงื่อนไข
const RANK_CLASS_OPTIONS = [
  { key: "officer",    label: "นายทหารสัญญาบัตร" },
  { key: "nco",        label: "นายทหารประทวน" },
  { key: "pvt",        label: "พลทหาร" },
  { key: "civilian",   label: "ลูกจ้างประจำ" },
  { key: "government", label: "พนักงานราชการ" },
]

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = decodeURIComponent(params.id as string)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("students")
  const [students, setStudents] = useState<InstructorStudent[]>([])
  const [grades, setGrades] = useState<InstructorGrade[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [gradesLoaded, setGradesLoaded] = useState(false)
  // ── เงื่อนไขหลักสูตร (ประเภท + ระดับที่มองเห็น + วิชาบังคับก่อน) ──
  const [policyType, setPolicyType] = useState<"general" | "conditional">("general")
  const [policyRanks, setPolicyRanks] = useState<string[]>([])
  const [prereqOptions, setPrereqOptions] = useState<{ id: string; name: string }[]>([])
  const [prereqSelected, setPrereqSelected] = useState<string[]>([])
  const [prereqLoaded, setPrereqLoaded] = useState(false)
  const [loadingPrereq, setLoadingPrereq] = useState(false)
  const [savingPrereq, setSavingPrereq] = useState(false)
  const [prereqMsg, setPrereqMsg] = useState("")

  const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://studio-signalstandard.rta.mi.th"

  useEffect(() => {
    if (!courseId) return
    api.instructorStudents(courseId)
      .then((r) => setStudents(r.results))
      .catch(() => {})
      .finally(() => setLoadingStudents(false))
  }, [courseId])

  // เปิดแท็บตาม query string เช่น ?tab=prereq (มาจากปุ่ม "เงื่อนไข" ในหน้ารายการ)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t === "grades" || t === "prereq") handleTabChange(t as Tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadGrades() {
    if (gradesLoaded) return
    setLoadingGrades(true)
    api.instructorGrades(courseId)
      .then((r) => { setGrades(r.results); setGradesLoaded(true) })
      .catch(() => {})
      .finally(() => setLoadingGrades(false))
  }

  function loadPrereq() {
    if (prereqLoaded) return
    setLoadingPrereq(true)
    api.instructorGetCoursePolicy(courseId)
      .then((p) => {
        setPolicyType(p.course_type ?? "general")
        setPolicyRanks(p.allowed_rank_classes ?? [])
        setPrereqOptions(p.course_options ?? [])
        setPrereqSelected(p.prerequisite_course_ids ?? [])
        setPrereqLoaded(true)
      })
      .catch(() => {})
      .finally(() => setLoadingPrereq(false))
  }

  async function savePrereq() {
    setSavingPrereq(true)
    setPrereqMsg("")
    try {
      await api.instructorSaveCoursePolicy(courseId, {
        course_type: policyType,
        allowed_rank_classes: policyType === "conditional" ? policyRanks : [],
        prerequisite_course_ids: policyType === "conditional" ? prereqSelected : [],
      })
      setPrereqMsg("✅ บันทึกเงื่อนไขหลักสูตรสำเร็จ")
    } catch (e: any) {
      setPrereqMsg("❌ " + (e.message || "บันทึกไม่สำเร็จ"))
    } finally {
      setSavingPrereq(false)
      setTimeout(() => setPrereqMsg(""), 3000)
    }
  }

  const togglePrereq = (id: string) =>
    setPrereqSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const toggleRank = (k: string) =>
    setPolicyRanks((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  function handleTabChange(t: Tab) {
    setTab(t)
    if (t === "grades") loadGrades()
    if (t === "prereq") loadPrereq()
  }

  const passCount = grades.filter(g => g.passed).length
  const failCount = grades.filter(g => !g.passed).length

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-2">
        <Link href="/instructor" className="hover:text-[#4A1A6B]">หลักสูตรของฉัน</Link>
        <span>›</span>
        <span className="text-gray-700">{courseId.split("+")[1] ?? courseId}</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#4A1A6B]">{courseId}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            นักเรียน {students.length} คน
            {gradesLoaded && (
              <span className="ml-3">
                <span className="text-green-600">ผ่าน {passCount}</span>
                {" · "}
                <span className="text-red-500">ไม่ผ่าน {failCount}</span>
              </span>
            )}
          </p>
        </div>
        <a
          href={`${STUDIO_URL}/course/${courseId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#4A1A6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7B3FA0] transition-colors flex items-center gap-2"
        >
          <span>✏️</span> แก้ไขใน Studio
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {[
          { key: "students" as Tab, label: "👥 รายชื่อนักเรียน" },
          { key: "grades"   as Tab, label: "📊 คะแนน" },
          { key: "prereq"   as Tab, label: "🔒 เงื่อนไขหลักสูตร" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-[#4A1A6B] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Students Tab */}
      {tab === "students" && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingStudents ? (
            <div className="p-12 text-center text-gray-400">กำลังโหลด...</div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center text-gray-400">ยังไม่มีนักเรียนลงทะเบียน</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">#</th>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3 text-left font-semibold">ชั้นยศ</th>
                  <th className="px-4 py-3 text-left font-semibold">หน่วย</th>
                  <th className="px-4 py-3 text-left font-semibold">วันที่ลงทะเบียน</th>
                  <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s, i) => (
                  <tr key={s.username} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.full_name}</p>
                      <p className="text-gray-400 text-xs">{s.username}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.rank}</td>
                    <td className="px-4 py-3 text-gray-600">{s.unit}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(s.created).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {s.is_active ? "ลงทะเบียนแล้ว" : "ยกเลิก"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Grades Tab */}
      {tab === "grades" && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingGrades ? (
            <div className="p-12 text-center text-gray-400">กำลังโหลดคะแนน...</div>
          ) : grades.length === 0 ? (
            <div className="p-12 text-center text-gray-400">ยังไม่มีข้อมูลคะแนน</div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="px-6 py-4 bg-[#f5f3f7] border-b border-gray-200 flex gap-6 text-sm">
                <span className="text-green-700 font-semibold">✅ ผ่าน: {passCount} คน</span>
                <span className="text-red-600 font-semibold">❌ ไม่ผ่าน: {failCount} คน</span>
                <span className="text-gray-600">คะแนนเฉลี่ย: {
                  grades.length > 0
                    ? Math.round(grades.reduce((sum, g) => sum + g.percent * 100, 0) / grades.length)
                    : 0
                }%</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Username</th>
                    <th className="px-4 py-3 text-left font-semibold">อีเมล</th>
                    <th className="px-4 py-3 text-left font-semibold">คะแนน (%)</th>
                    <th className="px-4 py-3 text-left font-semibold">เกรด</th>
                    <th className="px-4 py-3 text-left font-semibold">ผล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grades.map((g, i) => (
                    <tr key={g.username} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{g.username}</td>
                      <td className="px-4 py-3 text-gray-500">{g.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.round(g.percent * 100)}%`,
                                backgroundColor: g.passed ? "#16a34a" : "#dc2626"
                              }}
                            />
                          </div>
                          <span className="text-gray-700 font-medium w-10 text-right">
                            {Math.round(g.percent * 100)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#4A1A6B]">{g.letter_grade}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {g.passed ? "ผ่าน" : "ไม่ผ่าน"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Course Policy Tab — อาจารย์เจ้าของวิชากำหนดเงื่อนไขได้เต็ม (ประเภท + ระดับที่มองเห็น + วิชาบังคับก่อน) */}
      {tab === "prereq" && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-gray-800">เงื่อนไขหลักสูตร</h3>
            <p className="text-sm text-gray-500 mt-1">
              กำหนดประเภทหลักสูตร ระดับบุคลากรที่มองเห็นได้ และวิชาที่ต้องสอบผ่านก่อน
            </p>
          </div>

          {prereqMsg && (
            <div className={`px-4 py-2 rounded-lg text-sm mb-4 ${prereqMsg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {prereqMsg}
            </div>
          )}

          {loadingPrereq ? (
            <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
          ) : (
            <div className="space-y-6">
              {/* ประเภทหลักสูตร */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">ประเภทหลักสูตร</p>
                <div className="space-y-2 max-w-md">
                  <label className={`flex items-start gap-2 border rounded-lg p-3 cursor-pointer ${policyType === "general" ? "border-[#4A1A6B] bg-purple-50" : "border-gray-200"}`}>
                    <input type="radio" checked={policyType === "general"} onChange={() => setPolicyType("general")} className="mt-0.5" />
                    <span className="text-sm">
                      <span className="font-medium text-gray-800">หลักสูตรทั่วไป</span>
                      <span className="block text-xs text-gray-500">ทุกระดับมองเห็นและเข้าเรียนได้ทันที</span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-2 border rounded-lg p-3 cursor-pointer ${policyType === "conditional" ? "border-amber-400 bg-amber-50" : "border-gray-200"}`}>
                    <input type="radio" checked={policyType === "conditional"} onChange={() => setPolicyType("conditional")} className="mt-0.5" />
                    <span className="text-sm">
                      <span className="font-medium text-gray-800">หลักสูตรตามเงื่อนไข</span>
                      <span className="block text-xs text-gray-500">กำหนดระดับที่มองเห็น และวิชาบังคับก่อน</span>
                    </span>
                  </label>
                </div>
              </div>

              {policyType === "conditional" && (
                <>
                  {/* ระดับบุคลากรที่มองเห็น/สมัครได้ */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">ระดับที่มองเห็น/สมัครได้ <span className="font-normal text-gray-400">(ไม่เลือก = ทุกระดับ)</span></p>
                    <div className="flex flex-wrap gap-2">
                      {RANK_CLASS_OPTIONS.map((r) => (
                        <button key={r.key} type="button" onClick={() => toggleRank(r.key)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            policyRanks.includes(r.key)
                              ? "bg-[#4A1A6B] text-white border-[#4A1A6B]"
                              : "bg-white text-gray-600 border-gray-300 hover:border-[#4A1A6B]"}`}>
                          {policyRanks.includes(r.key) ? "✓ " : ""}{r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* วิชาบังคับก่อน */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">ต้องผ่านหลักสูตรเหล่านี้ก่อนจึงปลดล็อก</p>
                    {prereqOptions.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4">ไม่มีหลักสูตรอื่นให้เลือก</p>
                    ) : (
                      <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {prereqOptions.map((c) => (
                          <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={prereqSelected.includes(c.id)} onChange={() => togglePrereq(c.id)} />
                            <span className="text-gray-700">{c.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button onClick={savePrereq} disabled={savingPrereq}
                  className="bg-[#4A1A6B] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#7B3FA0] disabled:opacity-50">
                  {savingPrereq ? "กำลังบันทึก..." : "บันทึกเงื่อนไข"}
                </button>
                {policyType === "conditional" && (
                  <span className="text-xs text-gray-400">วิชาบังคับก่อน {prereqSelected.length} วิชา</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
