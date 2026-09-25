/**
 * components/ui/PageHeader.tsx
 * หัวข้อหน้า + คำอธิบายสั้น + ปุ่ม action (ถ้ามี) — pattern ซ้ำเดิมทุกหน้า
 * รวบเป็น component เดียวแทน hand-roll
 */
interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export default function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-[#2D0F42]">{title}</h1>
        {description && <p className="text-sm text-[#6b6478] mt-1">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
