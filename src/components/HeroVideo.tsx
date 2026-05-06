'use client';

import { useEffect, useRef } from 'react';

export default function HeroVideo() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

    const source = document.createElement('source');
    source.src = '/images/video-01.mp4';
    source.type = 'video/mp4';
    video.appendChild(source);
    container.appendChild(video);

    video.load();
    video.play().catch(() => {});

    return () => {
      container.removeChild(video);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="hero-video absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
