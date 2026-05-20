import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-card border border-line rounded-card shadow-card ${className}`}>
      {children}
    </div>
  )
}
