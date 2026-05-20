import Link from 'next/link'

type Props = {
  title: string
  action?: { label: string; href: string }
}

export function PanelHeader({ title, action }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      {action && (
        <Link href={action.href} className="text-xs font-semibold text-accent hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  )
}
