/**
 * components/ui/Card.tsx
 * การ์ดมาตรฐาน — พื้นขาว ขอบมน เงานุ่มโทนม่วงอ่อน (แทนเงาเทาทั่วไป)
 */
import { HTMLAttributes } from "react"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export default function Card({ hoverable = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-[#e6e1ee] shadow-[0_2px_14px_rgba(74,26,107,0.06)] ${
        hoverable ? "transition-all duration-150 hover:shadow-[0_6px_24px_rgba(74,26,107,0.12)] hover:-translate-y-0.5" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
