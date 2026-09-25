/**
 * app/thaid/callback/route.ts
 * GET /thaid/callback?code=&state= — ThaID redirect กลับมาที่นี่หลังยืนยันตัวตน
 *
 * ขั้นตอน (ฝั่ง server, client_secret ไม่หลุดไป browser):
 *   1) ตรวจ state กับ cookie ที่เซ็นไว้ (กัน CSRF)
 *   2) แลก authorization code → token ที่ token endpoint ของ ThaID (ผ่าน TLS โดยตรง)
 *   3) ดึงเลขบัตรประชาชน (PID) ที่ยืนยันแล้ว + ข้อมูลพื้นฐาน
 *   4) เซ็น assertion (อายุสั้น) แล้ว redirect ไปที่ Open edX เพื่อสร้าง session / พาไปสมัคร
 *
 * หมายเหตุความปลอดภัย: id_token ได้มาจากการแลก code กับ ThaID โดยตรงผ่าน TLS
 * (ช่องทางที่ยืนยันตัวตนแล้วด้วย client_secret) จึงถอด claim ได้โดยไม่ต้อง verify RS256
 * เอง หากภายหลัง ThaID กำหนดให้ตรวจลายเซ็นด้วย JWKS ค่อยเพิ่มได้ (ดู TODO)
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { thaidConfig, signAssertion, verifyAssertion } from "@/lib/thaid"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function origin(cfg: ReturnType<typeof thaidConfig>): string {
  return cfg.redirectUri.replace(/\/thaid\/callback$/, "")
}
function fail(cfg: ReturnType<typeof thaidConfig>, reason: string): NextResponse {
  const r = NextResponse.redirect(new URL(`/login?error=thaid_${reason}`, origin(cfg)))
  r.cookies.delete("thaid_state")
  return r
}
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".")
  if (parts.length < 2) return null
  try {
    const buf = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64")
    return JSON.parse(buf.toString("utf8"))
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const cfg = thaidConfig()
  if (!cfg.enabled || !cfg.assertionSecret) return fail(cfg, "unconfigured")

  const url = new URL(req.url)
  if (url.searchParams.get("error")) return fail(cfg, "denied")

  const code = url.searchParams.get("code") || ""
  const state = url.searchParams.get("state") || ""
  if (!code || !state) return fail(cfg, "missing_code")

  // 1) ตรวจ state
  const stateCookie = req.cookies.get("thaid_state")?.value || ""
  const stateData = verifyAssertion(stateCookie, cfg.assertionSecret)
  if (!stateData || stateData.state !== state) return fail(cfg, "bad_state")
  const nonce = String(stateData.nonce || "")

  // 2) แลก code → token
  let tokenJson: Record<string, unknown>
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    })
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }
    if (cfg.tokenAuth === "basic") {
      headers.Authorization = "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")
    } else {
      body.set("client_id", cfg.clientId)
      body.set("client_secret", cfg.clientSecret)
    }
    if (cfg.apiKey && cfg.apiKeyHeader) headers[cfg.apiKeyHeader] = cfg.apiKey
    const tr = await fetch(cfg.tokenUrl, { method: "POST", headers, body, cache: "no-store" })
    if (!tr.ok) return fail(cfg, "token_exchange")
    tokenJson = await tr.json()
  } catch {
    return fail(cfg, "token_network")
  }

  // 3) ดึง PID + ข้อมูลพื้นฐาน
  let claims: Record<string, unknown> | null = null
  const accessToken = String(tokenJson.access_token || "")
  if (cfg.userinfoUrl && accessToken) {
    try {
      const uiHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
      if (cfg.apiKey && cfg.apiKeyHeader) uiHeaders[cfg.apiKeyHeader] = cfg.apiKey
      const ur = await fetch(cfg.userinfoUrl, { headers: uiHeaders, cache: "no-store" })
      if (ur.ok) claims = await ur.json()
    } catch {
      /* fall back to id_token */
    }
  }
  if (!claims && tokenJson.id_token) claims = decodeJwtPayload(String(tokenJson.id_token))
  if (!claims) return fail(cfg, "no_claims")

  // TODO(หลังได้ spec ThaID): ตรวจ nonce ใน id_token และ verify RS256 ด้วย JWKS ถ้าจำเป็น
  if (nonce && claims.nonce && claims.nonce !== nonce) return fail(cfg, "bad_nonce")

  const pid = String(claims[cfg.pidClaim] || claims.pid || claims.sub || "").replace(/\D/g, "")
  if (pid.length !== 13) return fail(cfg, "no_pid")

  // 4) เซ็น assertion (อายุ 90 วินาที) ส่งต่อให้ Open edX
  const assertion = signAssertion(
    {
      pid,
      name: claims.name ?? claims.full_name ?? "",
      given_name: claims.given_name ?? "",
      family_name: claims.family_name ?? "",
      prefix: claims.title ?? claims.prefix ?? "",
      gender: claims.gender ?? "",
      birthdate: claims.birthdate ?? claims.birth_date ?? "",
      address: claims.address ?? "",
      src: "thaid",
    },
    cfg.assertionSecret,
    90,
  )

  const complete = new URL(cfg.completeUrl)
  complete.searchParams.set("a", assertion)
  const res = NextResponse.redirect(complete)
  res.cookies.delete("thaid_state")
  return res
}
