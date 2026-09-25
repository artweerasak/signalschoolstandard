/**
 * app/thaid/login/route.ts
 * GET /thaid/login — เริ่ม OIDC Authorization Code flow ไปยัง ThaID
 * เก็บ state+nonce ไว้ใน cookie ที่เซ็นแล้ว (httpOnly) เพื่อกัน CSRF ตอน callback
 */
import { NextResponse } from "next/server"
import { thaidConfig, signAssertion, randomToken } from "@/lib/thaid"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const cfg = thaidConfig()

  if (!cfg.enabled || !cfg.clientId || !cfg.authorizeUrl || !cfg.assertionSecret) {
    // ยังไม่ได้ตั้งค่า ThaID → กลับหน้า login พร้อมข้อความ
    return NextResponse.redirect(
      new URL("/login?error=thaid_unconfigured", cfg.redirectUri.replace(/\/thaid\/callback$/, "")),
    )
  }

  const state = randomToken()
  const nonce = randomToken()

  const authorize = new URL(cfg.authorizeUrl)
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("client_id", cfg.clientId)
  authorize.searchParams.set("redirect_uri", cfg.redirectUri)
  authorize.searchParams.set("scope", cfg.scope)
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("nonce", nonce)

  const res = NextResponse.redirect(authorize)
  // เซ็น state+nonce ไว้ใน cookie (อายุ 10 นาที) — verify ตอน callback
  res.cookies.set("thaid_state", signAssertion({ state, nonce }, cfg.assertionSecret, 600), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/thaid",
    maxAge: 600,
  })
  return res
}
