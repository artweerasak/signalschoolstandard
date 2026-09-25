/**
 * components/ui/Button.tsx
 * ปุ่มมาตรฐานของระบบ — 3 variant (primary-gold, secondary-purple-outline, ghost)
 */
import { ButtonHTMLAttributes, forwardRef } from "react"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-[#E8C96A] to-[#C9A84C] text-[#2D0F42] font-semibold shadow-[0_2px_10px_rgba(201,168,76,0.35)] hover:shadow-[0_4px_16px_rgba(201,168,76,0.5)] hover:-translate-y-px active:translate-y-0",
  secondary:
    "bg-transparent text-[#4A1A6B] font-medium border border-[#4A1A6B]/30 hover:border-[#4A1A6B] hover:bg-[#4A1A6B]/5",
  ghost:
    "bg-transparent text-[#4A1A6B] font-medium hover:bg-[#4A1A6B]/8",
  danger:
    "bg-transparent text-[#b91c1c] font-medium border border-[#b91c1c]/25 hover:bg-[#b91c1c]/5",
}

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
  lg: "text-sm px-6 py-2.5 gap-2",
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-full transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export default Button
