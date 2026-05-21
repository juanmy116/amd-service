import type { ReactNode } from 'react'

const VARIANTS = {
  solid:   'bg-accent text-white',
  danger:  'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info:    'bg-info-soft text-info',
  neutral: 'bg-neutral-soft text-ink-soft',
} as const

export type BadgeVariant = keyof typeof VARIANTS

type Props = {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

export function Badge({ children, variant = 'neutral', className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
