/**
 * lib/thaid.ts — ThaID (OpenID Connect, กรมการปกครอง) integration helpers.
 *
 * ทำงานฝั่ง server เท่านั้น (route handlers) — ใช้ node:crypto เพราะไม่พึ่ง dependency ภายนอก
 * client_secret และ assertion secret จะไม่ถูกส่งออกไปที่ browser
 *
 * ค่าตั้งทั้งหมดมาจาก .env.local (ดูคีย์ THAID_* ด้านล่าง) — โค้ดนี้ไม่ผูกค่าตายตัว
 * ให้เติมค่าจริงจากเอกสารที่ ThaID ออกให้หลังลงทะเบียน service provider
 */
import crypto from "node:crypto"

export interface ThaidConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  userinfoUrl: string
  scope: string
  redirectUri: string
  pidClaim: string
  tokenAuth: "basic" | "post"
  /** API Key สำหรับผ่าน API Gateway ของ ThaID (ส่งเป็น HTTP header) */
  apiKey: string
  /** ชื่อ header ของ API Key เช่น "Consumer-Key" / "x-api-key" (ดูจากเอกสาร ThaID) */
  apiKeyHeader: string
  assertionSecret: string
  /** ปลายทางฝั่ง Open edX ที่จะสร้าง session ให้ (same-origin) */
  completeUrl: string
}

export function thaidConfig(): ThaidConfig {
  const api = process.env.NEXT_PUBLIC_API_URL || "https://signalstandard.rta.mi.th"
  return {
    enabled: process.env.THAID_ENABLED === "1",
    clientId: process.env.THAID_CLIENT_ID || "",
    clientSecret: process.env.THAID_CLIENT_SECRET || "",
    authorizeUrl: process.env.THAID_AUTHORIZE_URL || "",
    tokenUrl: process.env.THAID_TOKEN_URL || "",
    userinfoUrl: process.env.THAID_USERINFO_URL || "",
    scope: process.env.THAID_SCOPE || "openid pid name birthdate",
    redirectUri: process.env.THAID_REDIRECT_URI || `${api}/thaid/callback`,
    pidClaim: process.env.THAID_PID_CLAIM || "pid",
    tokenAuth: (process.env.THAID_TOKEN_AUTH as "basic" | "post") || "basic",
    apiKey: process.env.THAID_API_KEY || "",
    apiKeyHeader: process.env.THAID_API_KEY_HEADER || "",
    assertionSecret: process.env.THAID_ASSERTION_SECRET || "",
    completeUrl: `${api}/military/api/v1/auth/thaid-complete/`,
  }
}

// ── base64url ──────────────────────────────────────────────────────────────
function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

// ── HS256 compact token (JWT-compatible) ─────────────────────────────────────
/** เซ็น payload เป็น token รูปแบบ header.payload.sig (แบบเดียวกับ edx ฝั่ง Python) */
export function signAssertion(payload: Record<string, unknown>, secret: string, ttlSec = 90): string {
  const now = Math.floor(Date.now() / 1000)
  const body = { iat: now, exp: now + ttlSec, jti: crypto.randomUUID(), ...payload }
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const pl = b64urlEncode(JSON.stringify(body))
  const sig = b64urlEncode(crypto.createHmac("sha256", secret).update(`${header}.${pl}`).digest())
  return `${header}.${pl}.${sig}`
}

/** ตรวจ token — คืน payload ถ้าถูกต้องและยังไม่หมดอายุ, ไม่งั้นคืน null */
export function verifyAssertion(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [header, pl, sig] = parts
  const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(`${header}.${pl}`).digest())
  const a = b64urlToBuf(sig)
  const b = b64urlToBuf(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let body: Record<string, unknown>
  try {
    body = JSON.parse(b64urlToBuf(pl).toString("utf8"))
  } catch {
    return null
  }
  if (typeof body.exp === "number" && Math.floor(Date.now() / 1000) > body.exp) return null
  return body
}

/** random state/nonce ปลอดภัย */
export function randomToken(bytes = 24): string {
  return b64urlEncode(crypto.randomBytes(bytes))
}
