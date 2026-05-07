import Image from 'next/image';

type PhotoFrameProps = {
  src: string;
  alt: string;
  credit?: string;
  className?: string;
  priority?: boolean;
};

export default function PhotoFrame({
  src,
  alt,
  credit,
  className = '',
  priority = false,
}: PhotoFrameProps) {
  return (
    <figure
      className={`relative overflow-hidden border ${className}`}
      style={{ borderColor: '#E5E7EB', backgroundColor: '#F5F5F5' }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw"
        className="object-cover"
      />
      {credit && (
        <figcaption
          className="absolute bottom-0 left-0 px-3 py-2 text-[10px] uppercase tracking-widest"
          style={{ backgroundColor: 'rgba(17,24,39,0.82)', color: 'rgba(255,255,255,0.72)' }}
        >
          {credit}
        </figcaption>
      )}
    </figure>
  );
}
