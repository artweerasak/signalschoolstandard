import { cookies } from "next/headers"
import { redirect } from "next/navigation"

// ตรวจสอบ session cookie: ถ้า login อยู่ → dashboard, ถ้าไม่ → login
export default async function Home() {
  const cookieStore = await cookies()
  const session = cookieStore.get("sessionid")
  if (session) {
    redirect("/dashboard")
  }
  redirect("/login")
}
