import { redirect } from "next/navigation"

// หน้าหลัก redirect ไปที่ login
export default function Home() {
  redirect("/login")
}
