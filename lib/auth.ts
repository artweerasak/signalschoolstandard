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

    // Open edX ตอบ 400 พร้อม JSON body ปกติเวลา login ผิด (ไม่ใช่ server error จริง)
    // ต้องลอง parse body ก่อนเช็ค res.ok ไม่งั้นจะโชว์ "Server error (400)" ที่เข้าใจผิดได้
    let data: { success?: boolean; error_code?: string } | null = null
    try {
      data = await res.json()
    } catch {
      // response ไม่ใช่ JSON — server error จริง ๆ
    }

    if (data && typeof data.success === "boolean") {
      if (data.success) return { success: true }

      // บัญชีถูกล็อกชั่วคราวจากการกรอกรหัสผิดเกินจำนวนครั้งที่กำหนด
      if (data.error_code === "account-locked-out") {
        return { success: false, error: "ถูกจำกัดการเข้าถึงเนื่องจากเข้าสู่ระบบผิดพลาดเกินจำนวนครั้งที่กำหนด" }
      }

      // Open edX ไม่แยก "ไม่มี user นี้" กับ "รหัสผ่านผิด" ในข้อความเดียวกันโดยตั้งใจ
      // (กันการเดา username) — เช็คแยกเองว่าเลขบัตรนี้มีอยู่ในระบบไหม เพื่อบอกผู้ใช้
      // ให้ไปสมัครสมาชิกถ้ายังไม่มีชื่อ แทนที่จะงงว่าทำไม login ไม่ได้
      if (data.error_code === "incorrect-email-or-password" || data.error_code === "failed-login-attempt") {
        try {
          const checkRes = await fetch(`/military/api/v1/auth/check-national-id/?national_id=${encodeURIComponent(nationalId)}`, {
            credentials: "include",
          })
          const checkData = await checkRes.json()
          if (checkRes.ok && checkData.exists === false) {
            return { success: false, error: "ไม่มีชื่อในระบบ กรุณาสมัครสมาชิก" }
          }
        } catch {
          // เช็คไม่ได้ก็ตกไปใช้ข้อความเดิมด้านล่าง ไม่ให้ login พังเพราะ endpoint นี้
        }
      }

      return { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }
    }

    return { success: false, error: `เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ (${res.status})` }
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
