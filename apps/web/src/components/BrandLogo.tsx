type BrandLogoProps = {
  inverse?: boolean;
  className?: string;
};

export default function BrandLogo({ inverse = false, className = '' }: BrandLogoProps) {
  return (
    <span className={`logo ${inverse ? 'logo-inverse' : ''} ${className}`.trim()} aria-label="flurbo">
      <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path strokeWidth="4.5" d="M11 19C18 7 39 5 51 14c10 8 7 29-4 38-11 10-31 4-39-9-6-10-3-18 3-24Z" />
          <path strokeWidth="4.5" d="M20 19c8-6 22-4 27 5 5 9-2 20-12 23-10 3-20-3-21-13-1-6 1-11 6-15Z" />
          <path strokeWidth="5.5" d="M27 27c6-4 14 0 14 7-1 6-9 9-14 5-5-4-5-9 0-12Z" />
        </g>
      </svg>
      <span className="logo-wordmark" aria-hidden="true">flurbo</span>
    </span>
  );
}
