/** Friendly, original illustrations drawn in SVG so they stay sharp and need no image files. */
import { useT } from '../i18n'

export function ShopIllustration() {
  const t = useT()
  return (
    <svg viewBox="0 0 420 460" width="100%" height="100%" role="img" aria-label={t('welcome.illustrationAlt')} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="awn" x1="0" x2="1">
          <stop offset="0" stopColor="#7448e6" />
          <stop offset="1" stopColor="#b34fd6" />
        </linearGradient>
        <linearGradient id="dress1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6aa8" />
          <stop offset="1" stopColor="#d6337f" />
        </linearGradient>
      </defs>
      <rect width="420" height="460" fill="none" />
      <rect x="40" y="70" width="340" height="300" rx="22" fill="#fff" opacity="0.7" />
      <path d="M40 70h340v46c0 14-14 26-28 26s-26-12-26-26c0 14-12 26-28 26s-28-12-28-26c0 14-12 26-28 26s-28-12-28-26c0 14-12 26-28 26s-26-12-26-26c0 14-14 26-28 26S40 130 40 116V70Z" fill="url(#awn)" />
      <rect x="64" y="170" width="292" height="6" rx="3" fill="#cdbdf5" />
      <g>
        <path d="M96 176l-18 74h60l-18-74Z" fill="url(#dress1)" />
        <path d="M170 176l-20 80h64l-20-80Z" fill="#7448e6" />
        <path d="M246 176l-18 74h60l-18-74Z" fill="#ffb25a" />
        <path d="M312 176l-14 62h50l-14-62Z" fill="#37b79a" />
      </g>
      <rect x="64" y="300" width="292" height="6" rx="3" fill="#cdbdf5" />
      <rect x="64" y="310" width="48" height="52" rx="8" fill="#e7defc" />
      <rect x="124" y="320" width="64" height="42" rx="8" fill="#f6d3e6" />
      <g transform="translate(250 230)">
        <ellipse cx="60" cy="214" rx="86" ry="14" fill="#5f33d4" opacity="0.15" />
        <path d="M18 214c0-60 14-100 42-100s42 40 42 100Z" fill="#8b4fe0" />
        <circle cx="60" cy="86" r="30" fill="#f2b896" />
        <path d="M30 84c0-26 14-38 30-38s30 12 30 38c-8-14-18-20-30-20s-22 6-30 20Z" fill="#2b1b4a" />
        <rect x="74" y="116" width="34" height="58" rx="7" fill="#1f1640" />
        <rect x="78" y="122" width="26" height="40" rx="4" fill="#9a76ff" />
        <circle cx="91" cy="146" r="7" fill="#fff" />
      </g>
      <g fill="#ffcf5a">
        <path d="M70 40l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" />
        <path d="M360 52l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </g>
    </svg>
  )
}

export function RobotIllustration() {
  const t = useT()
  return (
    <svg className="robot" viewBox="0 0 200 200" role="img" aria-label={t('welcome.robotAlt')}>
      <defs>
        <linearGradient id="rb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e5dcff" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="186" rx="52" ry="8" fill="#5f33d4" opacity="0.15" />
      <rect x="62" y="104" width="76" height="62" rx="26" fill="url(#rb)" stroke="#d2c2fa" strokeWidth="2" />
      <circle cx="100" cy="134" r="8" fill="#7448e6" />
      <rect x="44" y="40" width="112" height="78" rx="34" fill="url(#rb)" stroke="#d2c2fa" strokeWidth="2" />
      <rect x="56" y="54" width="88" height="50" rx="24" fill="#2b1b6e" />
      <circle cx="82" cy="78" r="7" fill="#7ee0ff" />
      <circle cx="118" cy="78" r="7" fill="#7ee0ff" />
      <path d="M88 92q12 9 24 0" stroke="#7ee0ff" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M100 40V26" stroke="#d2c2fa" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="22" r="6" fill="#ee4f99" />
      <g stroke="#ffcf5a" strokeWidth="3" strokeLinecap="round">
        <path d="M158 56l22-22" />
        <path d="M172 30l6 6M152 34l4 4" />
      </g>
      <path d="M178 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#ffcf5a" />
    </svg>
  )
}
