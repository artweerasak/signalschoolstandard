/**
 * components/StatCard.tsx
 * Card แสดง summary numbers บน Dashboard
 */

interface StatCardProps {
  title: string
  value: number | string
  icon: string
  color: "purple" | "green" | "red" | "yellow" | "blue"
  subtitle?: string
}

const accentMap = {
  purple: { bar: "bg-[#4A1A6B]", icon: "bg-[#4A1A6B]/10 text-[#4A1A6B]" },
  green:  { bar: "bg-emerald-600", icon: "bg-emerald-50 text-emerald-600" },
  red:    { bar: "bg-red-600", icon: "bg-red-50 text-red-600" },
  yellow: { bar: "bg-amber-500", icon: "bg-amber-50 text-amber-600" },
  blue:   { bar: "bg-blue-600", icon: "bg-blue-50 text-blue-600" },
}

export default function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  const accent = accentMap[color]
  return (
    <div className="relative bg-white rounded-2xl border border-[#e6e1ee] shadow-[0_2px_14px_rgba(74,26,107,0.06)] overflow-hidden transition-all duration-150 hover:shadow-[0_6px_24px_rgba(201,168,76,0.18)] hover:-translate-y-0.5">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} aria-hidden="true" />
      <div className="flex items-center gap-4 p-5 pl-6">
        <span className={`text-2xl w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ${accent.icon}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-[#6b6478] truncate">{title}</p>
          <p className="text-2xl font-bold leading-tight font-mono text-[#2D0F42]">
            {value.toLocaleString()}
          </p>
          {subtitle && <p className="text-xs text-[#9a92a8] mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
