/**
 * components/NetworkBackground.tsx
 * พื้นหลังโหนดโครงข่ายเคลื่อนไหวเบา ๆ สไตล์ไฮเทค — จุดลอยช้า ๆ เชื่อมเส้นบาง ๆ
 * เมื่ออยู่ใกล้กัน ใช้ canvas ล้วน (ไม่มี dependency ภายนอก) เบาต่อ performance:
 * โหนดจำนวนน้อย, หยุดวาดเมื่อ tab ไม่ active, เคารพ prefers-reduced-motion
 */
"use client"

import { useEffect, useRef } from "react"

interface Node { x: number; y: number; vx: number; vy: number }

const NODE_COUNT = 42
const LINK_DIST = 130
const DOT_COLOR = "232, 201, 106"   // --signal-gold-light
const LINE_COLOR = "123, 63, 160"   // --signal-purple-light

export default function NetworkBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0, height = 0, dpr = 1
    let nodes: Node[] = []
    let raf = 0

    function resize() {
      if (!canvas) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function makeNodes() {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
      }))
    }

    function step() {
      ctx!.clearRect(0, 0, width, height)

      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > width) n.vx *= -1
        if (n.y < 0 || n.y > height) n.vy *= -1
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < LINK_DIST) {
            ctx!.strokeStyle = `rgba(${LINE_COLOR}, ${(1 - dist / LINK_DIST) * 0.35})`
            ctx!.lineWidth = 1
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }

      for (const n of nodes) {
        ctx!.fillStyle = `rgba(${DOT_COLOR}, 0.8)`
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, 1.6, 0, Math.PI * 2)
        ctx!.fill()
      }

      if (!reduceMotion) raf = requestAnimationFrame(step)
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(raf)
      } else if (!reduceMotion) {
        raf = requestAnimationFrame(step)
      }
    }

    resize()
    makeNodes()
    step()
    if (reduceMotion) {
      // เฟรมเดียวนิ่ง ๆ พอสำหรับคนที่ตั้งค่าลดการเคลื่อนไหว
    }

    window.addEventListener("resize", () => { resize(); makeNodes() })
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full ${className}`}
    />
  )
}
