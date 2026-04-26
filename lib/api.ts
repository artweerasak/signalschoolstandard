/**
 * lib/api.ts
 * API client สำหรับเรียก Django backend
 */

// ใช้ /edx proxy (next.config.ts rewrites) เพื่อให้ cookie ทำงาน same-origin
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://signalstandard.rta.mi.th"

async function fetchAPI<T>(path: string): Promise<T> {
  const base = typeof window !== "undefined" ? "/edx" : API_URL
  const res = await fetch(`${base}/military/${path}`, {
    credentials: "include",
    headers: { "Accept": "application/json" },
  })
  if (res.status === 401) throw new Error("UNAUTHORIZED")
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json() as Promise<T>
}

async function fetchAPIPost<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const base = typeof window !== "undefined" ? "/edx" : API_URL
  const res = await fetch(`${base}/military/${path}`, {
    method,
    credentials: "include",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error("UNAUTHORIZED")
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
  role: "admin" | "instructor" | "student"
  full_name: string
  rank: string | null
  unit: string | null
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
  enrollment_count: number
}

export interface CourseListResponse {
  results: Course[]
  count: number
  next: string | null
  previous: string | null
}

// ── Admin Types ────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number
  username: string
  email: string
  is_active: boolean
  is_staff: boolean
  role: "admin" | "instructor" | "student"
  full_name: string
  rank: string
  rank_display: string
  unit: string
  sub_unit: string
  service_start_date: string
  birth_date: string
  created_at: string
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

export const api = {
  me:               () => fetchAPI<CurrentUser>("api/v1/me/"),
  dashboardSummary: () => fetchAPI<DashboardSummary>("api/v1/dashboard/summary/"),
  dashboardChart:   () => fetchAPI<DashboardChart>("api/v1/dashboard/chart/"),
  expiringSoon:     () => fetchAPI<{ results: ExpiringSoonItem[]; count: number }>("api/v1/dashboard/expiring-soon/"),
  rankStats:        () => fetchAPI<{ results: RankStat[] }>("api/v1/dashboard/rank-stats/"),
  myProfile:        () => fetchAPI<MyProfile>("api/v1/my/profile/"),
  myCertificates:   () => fetchAPI<{ results: MyCertificate[]; count: number }>("api/v1/my/certificates/"),

  // Open edX Course API — ดึงตรงจาก LMS ไม่ต้องผ่าน Django plugin
  courses: (search?: string, _category?: string) => {
    const params = new URLSearchParams({ page_size: "24" })
    if (search) params.set("search_term", search)
    const base = typeof window !== "undefined" ? "/edx" : API_URL
    return fetch(`${base}/api/courses/v1/courses/?${params}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(r => r.json() as Promise<CourseListResponse>)
  },

  // ── Admin ────────────────────────────────────────────────────────────────

  adminUsers: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {})
    return fetchAPI<AdminUserListResponse>(`api/v1/admin/users/?${qs}`)
  },

  adminCreateUser: (body: unknown) => fetchAPIPost<AdminUser>("api/v1/admin/users/create/", body),

  adminUpdateUser: (id: number, body: unknown) => fetchAPIPost<AdminUser>(`api/v1/admin/users/${id}/`, body, "PATCH"),

  adminDeactivateUser: (id: number) => fetchAPIPost<{ success: boolean }>(`api/v1/admin/users/${id}/delete/`, {}, "DELETE"),

  adminRegistrations: (status = "pending") => fetchAPI<RegistrationListResponse>(`api/v1/admin/registrations/?status=${status}`),

  adminRegistrationAction: (id: number, body: unknown) => fetchAPIPost<{ success: boolean; status: string }>(`api/v1/admin/registrations/${id}/`, body, "PATCH"),

  // ── Public ───────────────────────────────────────────────────────────────

  register: (body: unknown) => fetchAPIPost<{ id: number; status: string; message: string }>("api/v1/register/", body),

  // ── Instructor ───────────────────────────────────────────────────────────

  instructorCourses: () => fetchAPI<CourseListResponse>("api/v1/instructor/courses/"),

  instructorStudents: (courseId: string) => fetchAPI<{ results: InstructorStudent[]; count: number }>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/students/`),

  instructorGrades: (courseId: string) => fetchAPI<{ results: InstructorGrade[]; count: number }>(`api/v1/instructor/courses/${encodeURIComponent(courseId)}/grades/`),

  // ── Password ─────────────────────────────────────────────────────────────

  changePassword: (body: { current_password: string; new_password: string; confirm_password: string }) =>
    fetchAPIPost<{ success: boolean; message: string }>("api/v1/change-password/", body),

  adminResetPassword: (userId: number) =>
    fetchAPIPost<{ success: boolean; message: string }>(`api/v1/admin/users/${userId}/reset-password/`, {}),
}
