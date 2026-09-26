/**
 * app/prep-personnel/enroll/[curriculumId]/page.tsx
 * บรรจุกำลังพลเข้าหลักสูตร (cascade enrollment) — ค้นหากำลังพลจากชื่อ/หน่วย
 * แล้วเลือกได้หลายคน แทนการพิมพ์ user_id เอง บังคับ preview (dry-run) ก่อน
 * กดยืนยันจริงเสมอ เพราะ execute จริงเขียนเข้า enrollment จริงของ edX
 */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, EnrollDryRunResult, EnrollExecuteResult, PersonnelSearchRow, Organization } from "@/lib/api"

interface CatchUpResult { mode: "sync" | "async"; affected_count: number }

export default function EnrollPage() {
  const params = useParams()
  const curriculumId = Number(params.curriculumId)

  const [nationalQuota, setNationalQuota] = useState<number | null>(null)
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(0)

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [orgFilter, setOrgFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<PersonnelSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Map<number, PersonnelSearchRow>>(new Map())

  const [preview, setPreview] = useState<EnrollDryRunResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<EnrollExecuteResult | null>(null)
  const [error, setError] = useState("")
  const [catchingUp, setCatchingUp] = useState(false)
  const [catchUpResult, setCatchUpResult] = useState<CatchUpResult | null>(null)
  const [catchUpError, setCatchUpError] = useState("")

  useEffect(() => {
    if (!curriculumId) return
    api.getOrgQuotas(curriculumId)
      .then(r => { setNationalQuota(r.national_quota); setAlreadyEnrolled(r.national_requested) })
      .catch(() => {})
    api.organizationsPublic().then(r => setOrgs(r.results)).catch(() => {})
  }, [curriculumId])

  useEffect(() => {
    if (!searchQuery.trim() && !orgFilter) { setSearchResults([]); return }
    const t = setTimeout(() => {
      setSearching(true)
      api.searchPersonnel({
        q: searchQuery.trim() || undefined,
        organization_id: orgFilter ? Number(orgFilter) : undefined,
        page_size: orgFilter ? 100 : 20,
      })
        .then(r => setSearchResults(r.results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, orgFilter])

  const selectAllShown = () => {
    setSelected(prev => {
      const next = new Map(prev)
      for (const p of searchResults) next.set(p.id, p)
      return next
    })
    setPreview(null)
    setResult(null)
  }

  const toggleSelect = (person: PersonnelSearchRow) => {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(person.id)) next.delete(person.id)
      else next.set(person.id, person)
      return next
    })
    setPreview(null)
    setResult(null)
  }

  const removeSelected = (id: number) => {
    setSelected(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setPreview(null)
    setResult(null)
  }

  const studentIds = Array.from(selected.keys())

  const handleCatchUp = async () => {
    if (!confirm("ยืนยัน \"ตามให้ครบ\"? ระบบจะลงทะเบียนกำลังพลที่บรรจุไปแล้วเข้าวิชาที่เพิ่งเพิ่มใหม่ (วิชาเดิมจะไม่ถูกแตะต้องซ้ำ)")) return
    setCatchingUp(true)
    setCatchUpError("")
    setCatchUpResult(null)
    try {
      const r = await api.catchUpEnrollment(curriculumId)
      setCatchUpResult(r)
    } catch (err) {
      setCatchUpError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ")
    } finally {
      setCatchingUp(false)
    }
  }

  const handlePreview = async () => {
    if (studentIds.length === 0) { setError("กรุณาค้นหาและเลือกกำลังพลอย่างน้อย 1 คน"); return }
    setError("")
    setResult(null)
    setPreviewing(true)
    try {
      const r = await api.previewEnrollStudents(curriculumId, studentIds)
      setPreview(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจสอบไม่สำเร็จ")
    } finally {
      setPreviewing(false)
    }
  }

  const handleExecute = async () => {
    if (!preview) return
    if (!confirm(`ยืนยันบรรจุกำลังพล ${studentIds.length} คนเข้าหลักสูตรนี้จริง? การกระทำนี้จะลงทะเบียนเรียนจริงในระบบ e-Learning`)) return
    setExecuting(true)
    setError("")
    try {
      const r = await api.enrollStudents(curriculumId, studentIds)
      setResult(r)
      setPreview(null)
      setSelected(new Map())
      api.getOrgQuotas(curriculumId)
        .then(qr => { setNationalQuota(qr.national_quota); setAlreadyEnrolled(qr.national_requested) })
        .catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : "บรรจุไม่สำเร็จ")
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Link href="/prep-personnel" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <h1 className="text-2xl font-bold text-[#4A1A6B] mt-2">บรรจุกำลังพลเข้าหลักสูตร</h1>
        <p className="text-sm text-[#6b6478] mt-1">ระบบจะลงทะเบียนกำลังพลเข้าเรียนทุกวิชาในหลักสูตรนี้โดยอัตโนมัติ — ตรวจสอบผลก่อนยืนยันเสมอ</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold text-amber-900">ตามให้ครบ (ถ้ามีวิชาใหม่ถูกเพิ่มภายหลัง)</h2>
        <p className="text-sm text-amber-800">
          ถ้าแผนกเตรียมการเพิ่มวิชาใหม่เข้าหลักสูตรนี้ <em>หลังจาก</em> ที่บรรจุกำลังพลไปแล้วบางส่วน
          กำลังพลกลุ่มนั้นจะไม่ถูกลงทะเบียนวิชาใหม่ให้อัตโนมัติ — กดปุ่มนี้เพื่อให้ระบบตามลงทะเบียนวิชาใหม่ให้ทุกคนที่บรรจุไปแล้ว
          (วิชาเดิมที่ลงทะเบียนอยู่แล้วจะไม่ถูกแตะต้องซ้ำ)
        </p>
        {catchUpError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{catchUpError}</div>
        )}
        {catchUpResult && (
          <div className="bg-white border border-amber-200 px-3 py-2 rounded-lg text-sm text-amber-900">
            {catchUpResult.affected_count === 0
              ? "ยังไม่มีกำลังพลที่บรรจุไว้ก่อนหน้านี้ในหลักสูตรนี้"
              : `ดำเนินการแล้ว ${catchUpResult.affected_count} คน (${catchUpResult.mode === "async" ? "กำลังประมวลผลเบื้องหลัง" : "เสร็จสมบูรณ์"})`}
          </div>
        )}
        <button onClick={handleCatchUp} disabled={catchingUp}
          className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50">
          {catchingUp ? "กำลังดำเนินการ..." : "🔄 ตามให้ครบ"}
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="block text-sm font-medium text-[#4a4456]">ค้นหากำลังพล (ชื่อ/หน่วย หรือเลือกดูทั้งหน่วย)</label>
          {nationalQuota !== null && nationalQuota > 0 && (
            <p className="text-sm text-[#6b6478]">
              {alreadyEnrolled > 0 && (
                <>บรรจุไปแล้ว <span className="font-semibold text-[#2D0F42]">{alreadyEnrolled}</span> คน{" + "}</>
              )}
              เลือกใหม่ <span className="font-semibold text-[#4A1A6B]">{studentIds.length}</span> คน
              {" "}(รวม {alreadyEnrolled + studentIds.length} / {nationalQuota})
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="พิมพ์ชื่อ หรือ หน่วยต้นสังกัด..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
            className="sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#4a4456] focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
            <option value="">— หรือเลือกดูทั้งหน่วย —</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        {orgFilter && (
          <p className="text-xs text-[#9a92a8]">
            กำลังแสดงรายชื่อทั้งหมดของหน่วยที่เลือก — พิมพ์ชื่อเพิ่มในช่องค้นหาเพื่อกรองให้แคบลงได้
            <button type="button" onClick={() => setOrgFilter("")} className="ml-2 text-[#4A1A6B] hover:underline">ล้างตัวกรองหน่วย</button>
          </p>
        )}

        <div className="relative">
          {(searchQuery.trim() || orgFilter) && (
            <div className="mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-sm max-h-72 overflow-y-auto">
              {searching ? (
                <p className="px-3 py-2 text-sm text-[#9a92a8]">กำลังค้นหา...</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[#9a92a8]">ไม่พบกำลังพลที่ตรงกับเงื่อนไข</p>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#f7f5fa] border-b border-gray-100 sticky top-0">
                    <p className="text-xs text-[#9a92a8]">พบ {searchResults.length} คน</p>
                    <button type="button" onClick={selectAllShown}
                      className="text-xs font-medium text-[#4A1A6B] hover:underline">เลือกทั้งหมดที่แสดง</button>
                  </div>
                  {searchResults.map(p => (
                    <button type="button" key={p.id} onClick={() => toggleSelect(p)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 flex items-center justify-between gap-2
                        ${selected.has(p.id) ? "bg-purple-50" : "hover:bg-[#f7f5fa]"}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-[#2D0F42] truncate">{p.full_name}</p>
                        <p className="text-xs text-[#9a92a8] truncate">{p.organization_name || p.unit}</p>
                      </div>
                      {selected.has(p.id) && <span className="text-[#4A1A6B] shrink-0">✓ เลือกแล้ว</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
            {Array.from(selected.values()).map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#2D0F42] truncate">{p.full_name}</p>
                  <p className="text-xs text-[#9a92a8] truncate">{p.organization_name || p.unit}</p>
                </div>
                <button onClick={() => removeSelected(p.id)} className="text-xs text-red-500 hover:underline shrink-0">ลบ</button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
        )}

        <button onClick={handlePreview} disabled={previewing || studentIds.length === 0}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50">
          {previewing ? "กำลังตรวจสอบ..." : "🔍 ตรวจสอบก่อนบรรจุจริง (Dry-run)"}
        </button>
      </div>

      {preview && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-[#2D0F42]">ผลตรวจสอบ (ยังไม่บรรจุจริง)</h2>
            <button onClick={handleExecute} disabled={executing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
              {executing ? "กำลังบรรจุ..." : "✓ ยืนยันบรรจุจริง"}
            </button>
          </div>
          {preview.missing_student_ids.length > 0 && (
            <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-2 text-sm">
              ⚠️ ไม่พบผู้ใช้รหัส: {preview.missing_student_ids.join(", ")}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">กำลังพล</th>
                <th className="px-4 py-3">ผลรวม</th>
                <th className="px-4 py-3">รายละเอียดต่อวิชา</th>
              </tr>
            </thead>
            <tbody>
              {preview.preview.map(p => (
                <tr key={p.student_id} className="border-b border-[#f0ecf6]">
                  <td className="px-4 py-3">
                    {selected.get(p.student_id)
                      ? selected.get(p.student_id)!.full_name
                      : <span className="font-mono text-xs text-[#9a92a8]">{p.student_id}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      p.would_succeed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    }`}>
                      {p.would_succeed ? "สำเร็จทุกวิชา" : "มีวิชาที่จะล้มเหลว"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6b6478] space-y-1">
                    {p.courses.map(c => (
                      <div key={c.course_id} className={c.would_enroll ? "text-[#6b6478]" : "text-red-500"}>
                        {c.would_enroll ? "✓" : "✕"} {c.course_id} {c.error && `— ${c.error}`}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
          <p className="font-medium text-emerald-800">
            บรรจุเรียบร้อย ({result.mode === "sync" ? "ดำเนินการเสร็จทันที" : "กำลังดำเนินการในพื้นหลัง"})
          </p>
          <p className="text-sm text-emerald-700">คำขอทั้งหมด {result.enrollment_request_ids.length} รายการ</p>
          {result.missing_student_ids.length > 0 && (
            <p className="text-sm text-yellow-700">ไม่พบผู้ใช้: {result.missing_student_ids.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  )
}
