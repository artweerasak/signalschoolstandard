"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api, InstructorStudent, InstructorGrade, ExceededAttemptsResult, GradesSummary } from "@/lib/api"

type Tab = "students" | "grades" | "exceeded" | "prereq"

const GRADES_PAGE_SIZE = 20
const EXCEEDED_PAGE_SIZE = 20

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
  const [gradesTotal, setGradesTotal] = useState(0)
  const [gradesPage, setGradesPage] = useState(1)
  const [gradesSearch, setGradesSearch] = useState("")
  const [gradesSummary, setGradesSummary] = useState<GradesSummary | null>(null)
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [gradesLoaded, setGradesLoaded] = useState(false)
  const [exceeded, setExceeded] = useState<ExceededAttemptsResult[]>([])
  const [exceededTotal, setExceededTotal] = useState(0)
  const [exceededPage, setExceededPage] = useState(1)
  const [exceededSearch, setExceededSearch] = useState("")
  const [exceededNotPassedCount, setExceededNotPassedCount] = useState(0)
  const [hasAttemptLimits, setHasAttemptLimits] = useState(true)
  const [loadingExceeded, setLoadingExceeded] = useState(false)
  const [exceededLoaded, setExceededLoaded] = useState(false)
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
    if (t === "grades" || t === "exceeded" || t === "prereq") handleTabChange(t as Tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadGrades() {
    setLoadingGrades(true)
    api.instructorGrades(courseId, { page: gradesPage, page_size: GRADES_PAGE_SIZE, search: gradesSearch })
      .then((r) => {
        setGrades(r.results)
        setGradesTotal(r.count)
        setGradesSummary(r.summary)
        setGradesLoaded(true)
      })
      .catch(() => {})
      .finally(() => setLoadingGrades(false))
  }

  function loadExceeded() {
    setLoadingExceeded(true)
    api.instructorExceededAttempts(courseId, { page: exceededPage, page_size: EXCEEDED_PAGE_SIZE, search: exceededSearch })
      .then((r) => {
        setExceeded(r.results)
        setExceededTotal(r.count)
        setExceededNotPassedCount(r.not_passed_count ?? 0)
        setHasAttemptLimits(r.has_attempt_limits)
        setExceededLoaded(true)
      })
      .catch(() => {})
      .finally(() => setLoadingExceeded(false))
  }

  // ค้นหาเปลี่ยน → กลับไปหน้า 1
  useEffect(() => { setGradesPage(1) }, [gradesSearch])
  useEffect(() => { setExceededPage(1) }, [exceededSearch])

  // เปลี่ยนหน้า/ค้นหา ของแท็บที่เปิดอยู่ → โหลดใหม่ (หลังจากเข้าแท็บครั้งแรกแล้ว)
  useEffect(() => {
    if (tab === "grades" && gradesLoaded) loadGrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradesPage, gradesSearch])

  useEffect(() => {
    if (tab === "exceeded" && exceededLoaded) loadExceeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exceededPage, exceededSearch])

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
    if (t === "grades" && !gradesLoaded) loadGrades()
    if (t === "exceeded" && !exceededLoaded) loadExceeded()
    if (t === "prereq") loadPrereq()
  }

  const passCount = gradesSummary?.passed ?? 0
  const failCount = gradesSummary?.not_passed ?? 0
  const gradesTotalPages = Math.max(1, Math.ceil(gradesTotal / GRADES_PAGE_SIZE))
  const exceededTotalPages = Math.max(1, Math.ceil(exceededTotal / EXCEEDED_PAGE_SIZE))

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
          { key: "exceeded" as Tab, label: "⚠️ สอบเกินจำนวนครั้ง" },
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
        <div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="ค้นหาชื่อ หรือ Username..."
              value={gradesSearch}
              onChange={e => setGradesSearch(e.target.value)}
              className="w-full max-w-sm border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
            />
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingGrades ? (
            <div className="p-12 text-center text-gray-400">กำลังโหลดคะแนน...</div>
          ) : grades.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {gradesSearch ? "ไม่พบนักเรียนที่ค้นหา" : "ยังไม่มีข้อมูลคะแนน"}
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="px-6 py-4 bg-[#f5f3f7] border-b border-gray-200 flex gap-6 text-sm">
                <span className="text-green-700 font-semibold">✅ ผ่าน: {passCount} คน</span>
                <span className="text-red-600 font-semibold">❌ ไม่ผ่าน: {failCount} คน</span>
                <span className="text-gray-600">คะแนนเฉลี่ย: {
                  gradesSummary ? Math.round(gradesSummary.average_percent * 100) : 0
                }%</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">ชื่อ-สกุล</th>
                    <th className="px-4 py-3 text-left font-semibold">Username</th>
                    <th className="px-4 py-3 text-left font-semibold">คะแนน (%)</th>
                    <th className="px-4 py-3 text-left font-semibold">เกรด</th>
                    <th className="px-4 py-3 text-left font-semibold">ผล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grades.map((g, i) => (
                    <tr key={g.username} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{g.full_name}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{g.username}</td>
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

          {/* Pagination */}
          {gradesTotalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 flex-wrap gap-2">
              <span className="text-xs text-gray-500">
                แสดง {(gradesPage-1)*GRADES_PAGE_SIZE+1}–{Math.min(gradesPage*GRADES_PAGE_SIZE, gradesTotal)} จาก {gradesTotal.toLocaleString()} รายการ
              </span>
              <div className="flex gap-1 items-center">
                <button onClick={() => setGradesPage(1)} disabled={gradesPage===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">«</button>
                <button onClick={() => setGradesPage(p=>Math.max(1,p-1))} disabled={gradesPage===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">‹</button>
                <span className="px-3 py-1 text-xs bg-[#4A1A6B] text-white rounded">{gradesPage}</span>
                <span className="text-xs text-gray-400">/ {gradesTotalPages}</span>
                <button onClick={() => setGradesPage(p=>Math.min(gradesTotalPages,p+1))} disabled={gradesPage===gradesTotalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">›</button>
                <button onClick={() => setGradesPage(gradesTotalPages)} disabled={gradesPage===gradesTotalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">»</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Exceeded Attempts Tab */}
      {tab === "exceeded" && (
        <div>
          {hasAttemptLimits && (
            <div className="mb-3">
              <input
                type="text"
                placeholder="ค้นหาชื่อ หรือ Username..."
                value={exceededSearch}
                onChange={e => setExceededSearch(e.target.value)}
                className="w-full max-w-sm border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
              />
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingExceeded ? (
            <div className="p-12 text-center text-gray-400">กำลังตรวจสอบ...</div>
          ) : !hasAttemptLimits ? (
            <div className="p-12 text-center text-gray-400">
              วิชานี้ยังไม่ได้ตั้งค่า &quot;Maximum Attempts&quot; ในข้อสอบข้อใดเลย — รายงานนี้ใช้ได้เฉพาะข้อสอบที่จำกัดจำนวนครั้งไว้ใน Studio เท่านั้น
            </div>
          ) : exceeded.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {exceededSearch ? "ไม่พบนักเรียนที่ค้นหา" : "✅ ไม่มีนักเรียนที่สอบครบจำนวนครั้งแล้วยังไม่ผ่าน"}
            </div>
          ) : (
            <>
              <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex gap-6 text-sm">
                <span className="text-amber-700 font-semibold">
                  ⚠️ สอบเกินจำนวนครั้งที่กำหนดแล้วแต่ยังไม่ผ่านวิชา: {exceededNotPassedCount} คน
                </span>
                <span className="text-gray-500">
                  (ติดข้อสอบอย่างน้อย 1 ข้อที่ทำครบจำนวนครั้งแล้ว: {exceededTotal} คน)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">ชื่อ-สกุล</th>
                    <th className="px-4 py-3 text-left font-semibold">Username</th>
                    <th className="px-4 py-3 text-left font-semibold">ข้อที่ติด (ครบจำนวนครั้งแล้ว)</th>
                    <th className="px-4 py-3 text-left font-semibold">คะแนนรวมวิชา</th>
                    <th className="px-4 py-3 text-left font-semibold">ผลรวมวิชา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {exceeded.map((e, i) => (
                    <tr key={e.username} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{e.full_name}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{e.username}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium mr-1">
                          {e.stuck_count} ข้อ
                        </span>
                        <span className="text-xs text-gray-400">{e.stuck_problems.join(", ")}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{Math.round(e.course_percent * 100)}%</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {e.passed ? "ผ่าน" : "ไม่ผ่าน"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          </div>

          {/* Pagination */}
          {exceededTotalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 flex-wrap gap-2">
              <span className="text-xs text-gray-500">
                แสดง {(exceededPage-1)*EXCEEDED_PAGE_SIZE+1}–{Math.min(exceededPage*EXCEEDED_PAGE_SIZE, exceededTotal)} จาก {exceededTotal.toLocaleString()} รายการ
              </span>
              <div className="flex gap-1 items-center">
                <button onClick={() => setExceededPage(1)} disabled={exceededPage===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">«</button>
                <button onClick={() => setExceededPage(p=>Math.max(1,p-1))} disabled={exceededPage===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">‹</button>
                <span className="px-3 py-1 text-xs bg-[#4A1A6B] text-white rounded">{exceededPage}</span>
                <span className="text-xs text-gray-400">/ {exceededTotalPages}</span>
                <button onClick={() => setExceededPage(p=>Math.min(exceededTotalPages,p+1))} disabled={exceededPage===exceededTotalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">›</button>
                <button onClick={() => setExceededPage(exceededTotalPages)} disabled={exceededPage===exceededTotalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">»</button>
              </div>
            </div>
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
