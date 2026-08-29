import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Fire once, 80px into the viewport — same as the motion `viewport`
    // config this replaced. The global prefers-reduced-motion rule in
    // styles/index.css zeroes the transition for users who ask for that.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '-80px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${y}px)`,
        transition: `opacity 0.7s ${EASE} ${delay}s, transform 0.7s ${EASE} ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}
