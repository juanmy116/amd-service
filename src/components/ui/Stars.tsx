import { Star } from 'lucide-react'

/** Nota de 1 a 5 en estrellas. Se usa en la lista de opiniones y en la ficha de la avería. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rating ? 'text-amber-400' : 'text-line'}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}
