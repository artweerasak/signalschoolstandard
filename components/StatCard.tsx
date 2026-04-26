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

const colorMap = {
  purple: "bg-[#4A1A6B] text-white",
  green:  "bg-emerald-600 text-white",
  red:    "bg-red-600 text-white",
  yellow: "bg-amber-500 text-white",
  blue:   "bg-blue-600 text-white",
}

export default function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  return (
    <div className={`rounded-xl p-5 shadow-md ${colorMap[color]} flex items-center gap-4`}>
      <span className="text-4xl">{icon}</span>
      <div>
        <p className="text-sm opacity-80">{title}</p>
        <p className="text-3xl font-bold leading-tight">{value.toLocaleString()}</p>
        {subtitle && <p className="text-xs opacity-70 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
