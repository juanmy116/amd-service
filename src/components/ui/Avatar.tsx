type Props = {
  name: string
  size?: number
}

export function Avatar({ name, size = 32 }: Props) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials}
    </div>
  )
}
