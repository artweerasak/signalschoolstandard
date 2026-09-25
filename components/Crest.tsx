/**
 * components/Crest.tsx
 * ตราโล่กรมการทหารสื่อสาร วางบนแผ่นเหรียญวงกลม — ต้นฉบับ /signal_logo.png
 * เป็นทรงโล่สูง (209x276px, ไม่ใช่สี่เหลี่ยมจัตุรัส) การบังคับ width=height
 * เท่ากันแบบเดิมทำให้ภาพถูกยืดผิดสัดส่วน จุดนี้คำนวณขนาดภาพให้คงสัดส่วนจริง
 * แล้ววางกึ่งกลางบนแผ่นวงกลม — ใช้แทนการเรียก <Image> ตรง ๆ ทุกจุดที่มีโลโก้นี้
 */
import Image from "next/image"

const NATURAL_RATIO = 209 / 276 // width / height ของภาพต้นฉบับ

interface CrestProps {
  size: number       // เส้นผ่านศูนย์กลางวงกลมรวม (px)
  className?: string // ใส่ border/shadow ของแต่ละจุดที่เรียกใช้เอง
  priority?: boolean
}

export default function Crest({ size, className = "", priority = false }: CrestProps) {
  const imgHeight = Math.round(size * 0.82)
  const imgWidth = Math.round(imgHeight * NATURAL_RATIO)
  return (
    <div
      className={`rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/signal_logo.png"
        alt="กรมการทหารสื่อสาร"
        width={imgWidth}
        height={imgHeight}
        className="object-contain"
        priority={priority}
      />
    </div>
  )
}
