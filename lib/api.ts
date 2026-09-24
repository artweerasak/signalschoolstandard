/**
 * lib/api.ts
 * API client สำหรับเรียก Django backend
 */

// Caddy routes /military/* และ /login_ajax, /csrf/* ตรงไปที่ LMS โดยไม่ผ่าน Next.js proxy
// ทั้ง browser และ SSR ใช้ base URL เดียวกัน
const API_URL = typeof window !== "undefined"
  ? ""   // browser: relative path (same-origin → Caddy → LMS)
  : (process.env.NEXT_PUBLIC_API_URL ?? "https://signalstandard.rta.mi.th")

export const CAPACITY_EXCEEDED_EVENT = "military:capacity_exceeded"

function dispatchCapacityExceeded(detail: { active: number; limit: number; message: string }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CAPACITY_EXCEEDED_EVENT, { detail }))
  }
}

/** อ่าน CSRF token จาก cookie ที่ Open edX ตั้งค่าไว้หลัง login */
function getCsrfToken(): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ""
}

async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/military/${path}`, {
    credentials: "include",
    headers: { "Accept": "application/json" },
  })
  if (res.status === 401) throw new Error("UNAUTHORIZED")
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}))
    if (body.error === "capacity_exceeded") {
      dispatchCapacityExceeded(body)
      throw new Error("CAPACITY_EXCEEDED")
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function fetchAPIPost<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const csrfToken = getCsrfToken()
  const res = await fetch(`${API_URL}/military/${path}`, {
    method,
    credentials: "include",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
    },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error("UNAUTHORIZED")
  if (res.status === 503) {
    const body2 = await res.json().catch(() => ({}))
    if (body2.error === "capacity_exceeded") {
      dispatchCapacityExceeded(body2)
      throw new Error("CAPACITY_EXCEEDED")
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  total_personnel: number
  active_count: number
  expired_count: number
  renewed_count: number
  near_expiry_count: number
}

export interface DashboardChart {
  labels: string[]
  datasets: {
    active: number[]
    expired: number[]
    renewed: number[]
  }
}

export interface ExpiringSoonItem {
  user_id: number
  full_name: string
  rank: string
  unit: string
  course_id: string
  expiry_date: string
  days_left: number
}

export interface RankStat {
  code: string
  label: string
  count: number
}

export interface MyProfile {
  id: number
  username: string
  email: string
  full_name: string
  rank: string | null
  rank_display: string | null
  unit: string | null
  sub_unit: string | null
  service_start_date: string | null
  service_years: number | null
  birth_date: string | null
  age: number | null
}

export interface MyCertificate {
  id: number
  course_id: string
  course_name: string
  issued_date: string | null
  expiry_date: string | null
  status: string
  status_display: string
  days_left: number | null
  can_renew: boolean
}

export interface CurrentUser {
  id: number
  username: string
  email: string
  is_staff: boolean
  role: "admin" | "org_admin" | "instructor" | "student" | "prep_school" | "prep_personnel" | "evaluator"
  full_name: string
  rank: string | null
  unit: string | null
  organization_id?: number | null
}

// Open edX Course API — /api/courses/v1/courses/
export interface Course {
  id: string               // course-v1:Signal+SIG101+2024
  name: string
  short_description: string
  course_image_url: string | null
  start: string | null
  end: string | null
  enrollment_start: string | null
  enrollment_end: string | null
  org: string
  number: string
  effort: string | null
  category: string         // field เพิ่มเองใน plugin
  is_enrolled: boolean     // จาก enrollment API
  is_course_staff?: boolean // เป็น staff/instructor ของหลักสูตรนี้
  enrollment_count: number
  course_type?: "general" | "conditional"  // ประเภทหลักสูตร
  locked?: boolean         // ติดเงื่อนไขวิชาบังคับก่อน
  lock_reason?: string
}

export interface CourseListResponse {
  results: Course[]
  count: number
  next: string | null
  previous: string | null
}

// ── Admin Types ────────────────────────────────────────────────────────────

export interface Organization {
  id: number
  code: string
  name: string
  is_active: boolean
  member_count?: number
}

export interface OrgAdminDashboard {
  org_name: string
  total: number
  passed: number
  expired: number
  not_tested: number
  pct_passed: number
  pct_expired: number
  pct_not_tested: number
  passed_list: OrgMemberRow[]
  expired_list: OrgMemberRow[]
}

// ── Curriculum (prep_school) ──────────────────────────────────────────────

export interface CurriculumRegionQuota {
  id: number
  army_region: string
  quota: number
}

export interface CurriculumCourseItem {
  id: number
  course_id: string
  display_name: string
  sequence_order: number
  credit_hours: string
  credits: string
  assessment_type: "score" | "pass_fail"
  passing_score: string | null
  is_required: boolean
}

export interface CurriculumSummary {
  id: number
  name: string
  batch_code: string
  academic_year: number
  organization_id: number
  organization_name: string | null
  status: "draft" | "submitted" | "active" | "closed"
  quota_total: number
  course_count: number
  created_at: string | null
  submitted_at: string | null
}

export interface CurriculumDetail extends CurriculumSummary {
  eligible_rank_class: string
  eligible_personnel_type: string
  region_quotas: CurriculumRegionQuota[]
  courses: CurriculumCourseItem[]
}

// ── Quota/Demand Report + Cascade Enrollment (prep_personnel) ─────────────

export interface SubmittedCurriculumItem {
  id: number
  name: string
  batch_code: string
  academic_year: number
  organization_name: string | null
  status: "submitted" | "active"
  quota_total: number
  course_count: number
  submitted_at: string | null
}

export interface QuotaDemandRegionRow {
  army_region: string
  quota: number
  requested: number
  filled: number
}

export interface QuotaDemandReport {
  curriculum_id: number
  curriculum_name: string
  national_quota: number
  national_requested: number
  national_filled: number
  region_quotas: QuotaDemandRegionRow[]
}

export interface EnrollCoursePreview {
  course_id: string
  would_enroll: boolean
  error: string | null
}

export interface EnrollStudentPreview {
  student_id: number
  would_succeed: boolean
  courses: EnrollCoursePreview[]
}

export interface EnrollDryRunResult {
  dry_run: true
  preview: EnrollStudentPreview[]
  missing_student_ids: number[]
}

export interface EnrollExecuteResult {
  mode: "sync" | "async"
  enrollment_request_ids: number[]
  missing_student_ids: number[]
}

export interface EnrollmentRequestDetail {
  id: number
  curriculum_id: number
  curriculum_name: string
  student_id: number
  student_username: string
  status: "pending" | "processing" | "completed" | "partial_failed" | "failed"
  result_detail: Record<string, string>
  created_at: string | null
  processed_at: string | null
}

// ── Hybrid Grading + Co-Instructor (instructor) ────────────────────────────

export interface MyCurriculumCourseItem {
  id: number
  course_id: string
  display_name: string
  curriculum_name: string
  is_owner: boolean
  student_count: number
}

export interface RosterRow {
  student_id: number
  username: string
  full_name: string
  manual_grade_count: number
  final_score: string | null
  passed: boolean | null
}

export interface CoInstructorRow {
  user_id: number
  username: string
  is_owner: boolean
}

export interface OrgMemberRow {
  user_id: number
  full_name: string
  rank: string
  unit: string
  expiry_date: string | null
  course_name: string | null
}

export interface AdminUser {
  id: number
  username: string
  email: string
  is_active: boolean
  is_staff: boolean
  role: "admin" | "org_admin" | "instructor" | "student"
  full_name: string
  rank: string
  rank_display: string
  unit: string
  sub_unit: string
  service_start_date: string
  birth_date: string
  created_at: string
  organization_id: number | null
}

export interface AdminUserListResponse {
  count: number
  page: number
  page_size: number
  results: AdminUser[]
}

export interface PendingRegistration {
  id: number
  full_name_th: string
  rank: string
  rank_display: string
  unit: string
  birth_date: string
  email: string
  status: "pending" | "approved" | "rejected"
  status_display: string
  submitted_at: string
  reviewed_at: string | null
  reject_reason: string
  reviewed_by: string | null
}

export interface RegistrationListResponse {
  count: number
  page: number
  results: PendingRegistration[]
}

// ── Instructor Types ───────────────────────────────────────────────────────

export interface InstructorStudent {
  username: string
  full_name: string
  rank: string
  unit: string
  is_active: boolean
  created: string
}

export interface InstructorGrade {
  username: string
  email: string
  percent: number
  letter_grade: string
  passed: boolean
}


// ── Compliance Report Types ────────────────────────────────────────────────

export interface ComplianceOverview {
  total: number
  passed: number
  not_passed: number
  no_requirements: number
  percent_passed: number
}

export interface ComplianceByGroup {
  label: string
  key: string
  total: number
  passed: number
  not_passed: number
  no_requirements: number
  percent_passed: number
}

export interface NotPassedPersonnel {
  user_id: number
  username: string
  full_name: string
  rank: string
  rank_display: string
  unit: string
  sub_unit: string
  army_region: string
  army_region_display: string
  rank_class: string
  rank_class_display: string
  contact_email: string
  phone_number: string
  missing_courses: string[]
  expired_courses: string[]
}


export interface CertificateDetail {
  id: number
  cert_no: string
  course_id: string
  course_name: string
  issued_date: string | null
  expiry_date: string | null
  status: string
  days_left: number | null
  rank: string
  full_name: string
  unit: string
  sub_unit: string
}

export interface CertificateAlert {
  user_id: number
  full_name: string
  rank: string
  unit: string
  army_region: string
  course_id: string
  course_name: string
  expiry_date: string
  days_left: number
}

export interface CourseRequirement {
  id: number
  rank_class: string
  rank_class_display: string
  course_id: string
  course_name: string
  is_active: boolean
  created_at: string
}

export interface AdminCourseInstructor {
  user_id: number
  username: string
  full_name: string
}

export interface AdminCourse {
  id: string
  name: string
  short_description: string
  effort: string
  enrollment_count: number
  instructors: AdminCourseInstructor[]
  course_type?: "general" | "conditional"
  allowed_rank_classes?: string[]
  prerequisite_course_ids?: string[]
}

export interface CoursePolicy {
  course_id: string
  course_type: "general" | "conditional"
  allowed_rank_classes: string[]
  prerequisite_course_ids: string[]
  can_edit_visibility?: boolean
  course_options?: { id: string; name: string }[]
}

export const api = {
  me:               () => fetchAPI<CurrentUser>("api/v1/me/"),
  dashboardSummary: () => fetchAPI<DashboardSummary>("api/v1/dashboard/summary/"),
  dashboardChart:   () => fetchAPI<DashboardChart>("api/v1/dashboard/chart/"),
  expiringSoon:     () => fetchAPI<{ results: ExpiringSoonItem[]; count: number }>("api/v1/dashboard/expiring-soon/"),
  rankStats:        () => fetchAPI<{ results: RankStat[] }>("api/v1/dashboard/rank-stats/"),
  myProfile:        () => fetchAPI<MyProfile>("api/v1/my/profile/"),
  myCertificateDetail: (id: number) => fetchAPI<CertificateDetail>(`api/v1/my/certificates/${id}/`),
  myCertificates:   () => fetchAPI<{ results: MyCertificate[]; count: number }>("api/v1/my/certificates/"),

  // Course catalog — proxied through military plugin (avoids LMS CORS/redirect issues)
  courses: (search?: string, _category?: string) => {
    const params = new URLSearchParams({ page_size: "24" })
    if (search) params.set("search_term", search)
    return fetchAPI<CourseListResponse>(`api/v1/courses/?${params}`)
  },

  // ── Admin ────────────────────────────────────────────────────────────────

  adminUsers: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {})
    return fetchAPI<AdminUserListResponse>(`api/v1/admin/users/?${qs}`)
  },

  adminCreateUser: (body: unknown) => fetchAPIPost<AdminUser>("api/v1/admin/users/create/", body),

  adminUpdateUser: (id: number, body: unknown) => fetchAPIPost<AdminUser>(`api/v1/admin/users/${id}/`, body, "PATCH"),

  adminDeactivateUser: (id: number) => fetchAPIPost<{ success: boolean }>(`api/v1/admin/users/${id}/delete/`, {}, "DELETE"),

  adminHardDeleteUser: (id: number) => fetchAPIPost<{ success: boolean; message: string }>(`api/v1/admin/users/${id}/hard-delete/`, {}, "DELETE"),

  adminRegistrations: (status = "pending") => fetchAPI<RegistrationListResponse>(`api/v1/admin/registrations/?status=${status}`),
  adminCourses: () => fetchAPI<{ results: AdminCourse[]; count: number }>("api/v1/admin/courses/"),
  adminAssignInstructor: (courseId: string, userId: number, action: "add" | "remove") =>
    fetchAPIPost<{ success: boolean }>(`api/v1/admin/courses/${encodeURIComponent(courseId)}/assign-instructor/`, { user_id: userId, action }),
  adminDeleteCourse: (courseId: string) =>
    fetchAPIPost<{ success: boolean }>(`api/v1/admin/courses/${encodeURIComponent(courseId)}/delete/`, {}, "DELETE"),
  adminGetCoursePolicy: (courseId: string) =>
    fetchAPI<CoursePolicy>(`api/v1/admin/courses/${encodeURIComponent(courseId)}/policy/`),
  adminSaveCoursePolicy: (courseId: string, body: { course_type: string; allowed_rank_classes: string[]; prerequisite_course_ids: string[] }) =>
    fetchAPIPost<CoursePolicy & { success: boolean }>(`api/v1/admin/courses/${encodeURIComponent(courseId)}/policy/`, body),
  adminRenameCourse: (courseId: string, courseName: string) =>
    fetchAPIPost<{ success: boolean; course_name: string }>(`api/v1/admin/courses/${encodeURIComponent(courseId)}/rename/`, { course_name: courseName }, "PATCH"),

  adminRegistrationAction: (id: number, body: unknown) => fetchAPIPost<{ success: boolean; status: string }>(`api/v1/admin/registrations/${id}/`, body, "PATCH"),

  // ── Public ───────────────────────────────────────────────────────────────

  register: (body: unknown) => fetchAPIPost<{ id: number; status: string; message: string }>("api/v1/register/", body),

  // ── Instructor ───────────────────────────────────────────────────────────

  instructorCourses: () => fetchAPI<CourseListResponse>("api/v1/instructor/courses/"),
  instructorGetCoursePolicy: (courseId: string) =>
    fetchAPI<CoursePolicy>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/policy/`),
  instructorSaveCoursePolicy: (courseId: string, body: { course_type: string; allowed_rank_classes: string[]; prerequisite_course_ids: string[] }) =>
    fetchAPIPost<CoursePolicy & { success: boolean }>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/policy/`, body),
  deleteInstructorCourse: (courseId: string) => fetchAPIPost<{ success: boolean }>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/delete/`, {}, "DELETE"),

  instructorStudents: (courseId: string) => fetchAPI<{ results: InstructorStudent[]; count: number }>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/students/`),

  instructorGrades: (courseId: string) => fetchAPI<{ results: InstructorGrade[]; count: number }>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/grades/`),

  // ── Password ─────────────────────────────────────────────────────────────

  changePassword: (body: { current_password: string; new_password: string; confirm_password: string }) =>
    fetchAPIPost<{ success: boolean; message: string }>("api/v1/change-password/", body),

  adminResetPassword: (userId: number) =>
    fetchAPIPost<{ success: boolean; message: string }>(`api/v1/admin/users/${userId}/reset-password/`, {}),
  // ── Compliance Reports ───────────────────────────────────────────────────

  complianceOverview: () => fetchAPI<ComplianceOverview>("api/v1/reports/compliance/overview/"),

  complianceByRegion: () =>
    fetchAPI<ComplianceByGroup[]>("api/v1/reports/compliance/by-region/"),

  complianceByRankClass: () =>
    fetchAPI<ComplianceByGroup[]>("api/v1/reports/compliance/by-rank-class/"),

  complianceByRank: () =>
    fetchAPI<ComplianceByGroup[]>("api/v1/reports/compliance/by-rank/"),

  complianceByUnit: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {})
    return fetchAPI<ComplianceByGroup[]>(`api/v1/reports/compliance/by-unit/?${qs}`)
  },

  complianceNotPassed: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {})
    return fetchAPI<{ results: NotPassedPersonnel[]; count: number }>(`api/v1/reports/compliance/not-passed/?${qs}`)
  },

  certificatesExpiring: (days = 30) =>
    fetchAPI<{ results: CertificateAlert[]; count: number }>(`api/v1/reports/certificates/expiring/?days=${days}`),

  certificatesExpired: () =>
    fetchAPI<{ results: CertificateAlert[]; count: number }>("api/v1/reports/certificates/expired/"),

  // ── Course Requirements CRUD ─────────────────────────────────────────────

  courseRequirements: () =>
    fetchAPI<{ results: CourseRequirement[]; count: number }>("api/v1/admin/course-requirements/"),

  createCourseRequirement: (body: unknown) =>
    fetchAPIPost<CourseRequirement>("api/v1/admin/course-requirements/", body),

  updateCourseRequirement: (id: number, body: unknown) =>
    fetchAPIPost<CourseRequirement>(`api/v1/admin/course-requirements/${id}/`, body, "PATCH"),

  deleteCourseRequirement: (id: number) =>
    fetchAPIPost<{ success: boolean }>(`api/v1/admin/course-requirements/${id}/`, {}, "DELETE"),

  // ── Organizations ─────────────────────────────────────────────────────────
  organizationsPublic: () =>
    fetchAPI<{ results: Organization[] }>("api/v1/organizations/"),

  adminOrganizations: (params?: { q?: string; active_only?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set("q", params.q)
    if (params?.active_only) qs.set("active_only", "1")
    return fetchAPI<{ count: number; results: Organization[] }>(`api/v1/admin/organizations/?${qs}`)
  },
  adminCreateOrganization: (body: { name: string; code: string }) =>
    fetchAPIPost<Organization>("api/v1/admin/organizations/", body),

  adminUpdateOrganization: (id: number, body: Partial<Organization>) =>
    fetchAPIPost<Organization>(`api/v1/admin/organizations/${id}/`, body, "PATCH"),

  adminDeactivateOrganization: (id: number) =>
    fetchAPIPost<{ status: string }>(`api/v1/admin/organizations/${id}/`, {}, "DELETE"),

  adminBulkTransfer: (orgId: number, targetOrgId: number) =>
    fetchAPIPost<{ moved: number; from: string; to: string }>(
      `api/v1/admin/organizations/${orgId}/bulk-transfer/`, { target_org_id: targetOrgId }
    ),

  // ── Org Admin ─────────────────────────────────────────────────────────────
  orgAdminDashboard: (orgId?: number) => {
    const qs = orgId ? `?org_id=${orgId}` : ""
    return fetchAPI<OrgAdminDashboard>(`api/v1/org-admin/dashboard/${qs}`)
  },
  orgAdminUsers: (params?: { q?: string; org_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set("q", params.q)
    if (params?.org_id) qs.set("org_id", String(params.org_id))
    return fetchAPI<{ count: number; results: OrgMemberRow[] }>(`api/v1/org-admin/users/?${qs}`)
  },

  // ── Curriculum (prep_school) ─────────────────────────────────────────────
  listCurricula: (params?: { status?: string; org_id?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.org_id) qs.set("org_id", String(params.org_id))
    return fetchAPI<{ count: number; results: CurriculumSummary[] }>(`api/v1/curriculum/curricula/?${qs}`)
  },
  createCurriculum: (body: {
    name: string; batch_code: string; academic_year: number; organization_id?: number
    eligible_rank_class?: string; eligible_personnel_type?: string; quota_total?: number
    region_quotas?: { army_region: string; quota: number }[]
  }) => fetchAPIPost<CurriculumDetail>("api/v1/curriculum/curricula/", body),
  getCurriculum: (id: number) => fetchAPI<CurriculumDetail>(`api/v1/curriculum/curricula/${id}/`),
  updateCurriculum: (id: number, body: Partial<{
    name: string; batch_code: string; academic_year: number
    eligible_rank_class: string; eligible_personnel_type: string; quota_total: number
  }>) => fetchAPIPost<CurriculumDetail>(`api/v1/curriculum/curricula/${id}/`, body, "PATCH"),
  addCurriculumCourse: (id: number, body: {
    course_id: string; display_name: string; credit_hours: number; credits: number
    assessment_type?: "score" | "pass_fail"; passing_score?: number
    is_required?: boolean; sequence_order?: number
  }) => fetchAPIPost<{ id: number; course_id: string; display_name: string }>(
    `api/v1/curriculum/curricula/${id}/courses/`, body
  ),
  removeCurriculumCourse: (id: number, coursePk: number) =>
    fetchAPIPost<{ deleted: boolean }>(`api/v1/curriculum/curricula/${id}/courses/${coursePk}/`, {}, "DELETE"),
  submitCurriculum: (id: number) =>
    fetchAPIPost<CurriculumDetail>(`api/v1/curriculum/curricula/${id}/submit/`, {}),

  // ── Quota/Demand Report + Cascade Enrollment (prep_personnel) ────────────
  listSubmittedCurricula: (status?: "submitted" | "active") => {
    const qs = status ? `?status=${status}` : ""
    return fetchAPI<{ count: number; results: SubmittedCurriculumItem[] }>(`api/v1/curriculum/curricula/submitted/${qs}`)
  },
  activateCurriculum: (id: number) =>
    fetchAPIPost<{ id: number; status: string }>(`api/v1/curriculum/curricula/${id}/activate/`, {}),
  getQuotaDemandReport: (curriculumId: number) =>
    fetchAPI<QuotaDemandReport>(`api/v1/curriculum/reports/quota-demand/?curriculum_id=${curriculumId}`),
  previewEnrollStudents: (curriculumId: number, studentIds: number[]) =>
    fetchAPIPost<EnrollDryRunResult>(`api/v1/curriculum/curricula/${curriculumId}/enroll/`, {
      student_ids: studentIds, dry_run: true,
    }),
  enrollStudents: (curriculumId: number, studentIds: number[]) =>
    fetchAPIPost<EnrollExecuteResult>(`api/v1/curriculum/curricula/${curriculumId}/enroll/`, {
      student_ids: studentIds,
    }),
  getEnrollmentRequest: (id: number) =>
    fetchAPI<EnrollmentRequestDetail>(`api/v1/curriculum/enrollment-requests/${id}/`),
  retryEnrollment: (id: number) =>
    fetchAPIPost<EnrollmentRequestDetail>(`api/v1/curriculum/enrollment-requests/${id}/retry/`, {}),

  // ── Hybrid Grading + Co-Instructor (instructor) ──────────────────────────
  getMyCurriculumCourses: () =>
    fetchAPI<{ count: number; results: MyCurriculumCourseItem[] }>("api/v1/curriculum/my-courses/"),
  getCurriculumCourseRoster: (id: number) =>
    fetchAPI<{ count: number; results: RosterRow[] }>(`api/v1/curriculum/my-courses/${id}/roster/`),
  addManualGrade: (id: number, body: {
    student_id: number; component_name: string; score: number; max_score: number
    weight?: number; notes?: string
  }) => fetchAPIPost<{ id: number; component_name: string; score: string }>(
    `api/v1/curriculum/my-courses/${id}/manual-grades/`, body
  ),
  updateManualGrade: (id: number, gradeId: number, body: Partial<{
    component_name: string; score: number; max_score: number; weight: number; notes: string
  }>) => fetchAPIPost<{ id: number; score: string; max_score: string }>(
    `api/v1/curriculum/my-courses/${id}/manual-grades/${gradeId}/`, body, "PATCH"
  ),
  finalizeCurriculumCourse: (id: number) =>
    fetchAPIPost<{ finalized_count: number }>(`api/v1/curriculum/my-courses/${id}/finalize/`, {}),
  getCoInstructors: (id: number) =>
    fetchAPI<{ results: CoInstructorRow[] }>(`api/v1/curriculum/my-courses/${id}/co-instructors/`),
  addCoInstructor: (id: number, userId: number) =>
    fetchAPIPost<{ user_id: number; username: string }>(`api/v1/curriculum/my-courses/${id}/co-instructors/`, { user_id: userId }),
  removeCoInstructor: (id: number, userId: number) =>
    fetchAPIPost<{ deleted: boolean }>(`api/v1/curriculum/my-courses/${id}/co-instructors/${userId}/`, {}, "DELETE"),

  // ── Video Folder Sharing ─────────────────────────────────────────────────
  getVideoShare: (courseSlug: string) =>
    fetchAPI<{ instructors: { id: number; username: string; full_name: string; already_shared: boolean }[] }>(
      `api/v1/videos/share/?course_slug=${encodeURIComponent(courseSlug)}`
    ),
  addVideoShare: (courseSlug: string, username: string) =>
    fetchAPIPost<{ success: boolean }>("api/v1/videos/share/", { course_slug: courseSlug, username }),
  removeVideoShare: (courseSlug: string, username: string) =>
    fetchAPIPost<{ success: boolean }>("api/v1/videos/share/", { course_slug: courseSlug, username }, "DELETE"),

  // ── Document Folder Sharing ───────────────────────────────────────────────
  getDocShare: (courseSlug: string) =>
    fetchAPI<{ instructors: { id: number; username: string; full_name: string; already_shared: boolean }[] }>(
      `api/v1/documents/share/?course_slug=${encodeURIComponent(courseSlug)}`
    ),
  addDocShare: (courseSlug: string, username: string) =>
    fetchAPIPost<{ success: boolean }>("api/v1/documents/share/", { course_slug: courseSlug, username }),
  removeDocShare: (courseSlug: string, username: string) =>
    fetchAPIPost<{ success: boolean }>("api/v1/documents/share/", { course_slug: courseSlug, username }, "DELETE"),
}
