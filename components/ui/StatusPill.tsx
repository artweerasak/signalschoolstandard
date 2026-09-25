/**
 * components/ui/StatusPill.tsx
 * ป้ายสถานะทรงแคปซูล ตัวหนังสือ monospace — แทน badge สีที่เคย hardcode
 * แยกกันในแต่ละหน้า (เช่น #FEE2E2/#DCFCE7) ให้ใช้ token เดียวกันทั้งระบบ
 */
type Tone = "success" | "warning" | "error" | "info" | "neutral"

interface StatusPillProps {
  children: React.ReactNode
  tone?: Tone
}

const toneClasses: Record<Tone, string> = {
  success: "bg-[#dcfce7] text-[#15803d]",
  warning: "bg-[#fef3c7] text-[#b45309]",
  error:   "bg-[#fee2e2] text-[#b91c1c]",
  info:    "bg-[#dbeafe] text-[#1d4ed8]",
  neutral: "bg-[#f7f5fa] text-[#6b6478]",
}

export default function StatusPill({ children, tone = "neutral" }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide font-mono ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}
