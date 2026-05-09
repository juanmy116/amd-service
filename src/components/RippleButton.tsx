'use client';

import { useRef, MouseEvent, ReactNode, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

interface RippleButtonProps {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  rippleColor?: string;
}

export default function RippleButton({
  href,
  children,
  className = '',
  style,
  rippleColor = 'rgba(255,255,255,0.35)',
}: RippleButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.5;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    Object.assign(ripple.style, {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      left: `${x}px`,
      top: `${y}px`,
      borderRadius: '50%',
      background: rippleColor,
      transform: 'scale(0)',
      animation: 'ripple-expand 550ms ease-out forwards',
      pointerEvents: 'none',
    });
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    setTimeout(() => router.push(href), 120);
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className={`relative overflow-hidden cursor-pointer ${className}`}
      style={style}
    >
      <span className="relative z-10 flex items-center justify-center w-full">{children}</span>
    </button>
  );
}
