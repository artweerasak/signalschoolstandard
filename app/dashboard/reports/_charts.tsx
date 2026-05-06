"use client"
import { Doughnut, Bar } from "react-chartjs-2"
import {
  Chart,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js"
import { ComplianceByGroup } from "@/lib/api"

Chart.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  type: "donut" | "bar"
  passed: number
  notPassed: number
  data: ComplianceByGroup[]
}

export default function ChartComponents({ type, passed, notPassed, data }: Props) {
  if (type === "donut") {
    return (
      <Doughnut
        data={{
          labels: ["ผ่านมาตรฐาน", "ยังไม่ผ่าน"],
          datasets: [{
            data: [passed, notPassed],
            backgroundColor: ["#34d399", "#f87171"],
            borderWidth: 0,
            hoverOffset: 6,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: "70%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 12 }, padding: 16 },
            },
          },
        }}
      />
    )
  }

  const safeData = Array.isArray(data) ? data : []
  return (
    <Bar
      data={{
        labels: safeData.map(d => d.label),
        datasets: [
          {
            label: "ผ่าน",
            data: safeData.map(d => d.passed),
            backgroundColor: "rgba(52,211,153,0.85)",
            borderRadius: 6,
          },
          {
            label: "ไม่ผ่าน",
            data: safeData.map(d => d.not_passed),
            backgroundColor: "rgba(248,113,113,0.85)",
            borderRadius: 6,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
        },
      }}
    />
  )
}
