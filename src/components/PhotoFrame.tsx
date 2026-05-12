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
    </figure>
  );
}
