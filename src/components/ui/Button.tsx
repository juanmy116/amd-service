import type { ButtonHTMLAttributes, ReactNode } from 'react'

const VARIANTS = {
  primary:   'bg-accent text-white shadow-raised hover:opacity-90',
  secondary: 'bg-card border border-line text-ink hover:bg-neutral-soft',
  ghost:     'text-ink-soft hover:bg-neutral-soft',
} as const

export type ButtonVariant = keyof typeof VARIANTS

export function buttonClasses(variant: ButtonVariant = 'primary'): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${VARIANTS[variant]}`
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: Props) {
  return (
    <button className={`${buttonClasses(variant)} ${className}`} {...rest}>
      {children}
    </button>
  )
}
