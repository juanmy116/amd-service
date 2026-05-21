import type { ReactNode } from 'react'

export default function AtelierLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0E0E12] text-white">
      {children}
    </div>
  )
}
