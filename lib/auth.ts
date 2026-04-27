/**
 * lib/auth.ts
 * ฟังก์ชัน authentication — เชื่อมกับ Open edX session login
 * Caddy routes /csrf/*, /login_ajax, /logout ตรงไปที่ LMS (same-origin cookies)
 */

export interface LoginResult {
  success: boolean
  error?: string
}

/** ดึง CSRF token จาก Open edX ก่อน POST */
async function getCsrfToken(): Promise<string> {
  const res = await fetch(`/csrf/api/v1/token`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
  if (!res.ok) throw new Error("Cannot get CSRF token")
  const data = await res.json()
  return data.csrfToken as string
}

/**
 * Login ด้วย National ID + Military ID
 * Open edX รับ email + password — MilitaryAuthBackend ตรวจสอบ national_id + military_id
 */
export async function loginWithMilitaryId(
  nationalId: string,
  militaryId: string
): Promise<LoginResult> {
  try {
    const csrf = await getCsrfToken()

    const res = await fetch(`/login_ajax`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": csrf,
      },
      credentials: "include",
      body: new URLSearchParams({
        email: nationalId,
        password: militaryId,
      }),
    })

    if (!res.ok) {
      return { success: false, error: `Server error (${res.status})` }
    }

    const data = await res.json()

    if (data.success) {
      return { success: true }
    }
    return { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("Cannot get CSRF")) {
      return { success: false, error: "ไม่สามารถเชื่อมต่อ server ได้" }
    }
    return { success: false, error: "ไม่สามารถเชื่อมต่อ server ได้" }
  }
}

/** Logout */
export async function logout(): Promise<void> {
  try {
    const csrf = await getCsrfToken()
    await fetch(`/logout`, {
      method: "POST",
      headers: { "X-CSRFToken": csrf },
      credentials: "include",
    })
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem("user")
  }
}
