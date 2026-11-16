import type { SVGProps } from 'react'

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  posts: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 11 4.5-4.5L14 15l2.5-2.5L20 16M9 9h.01',
  box: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9ZM3.5 7.5 12 12m0 0 8.5-4.5M12 12v9',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2.1-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2.1 1.2l.4 2.6h4l.4-2.6c.8-.3 1.5-.7 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5.5v.01M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5',
  mic: 'M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm-7-3.5a7 7 0 0 0 14 0M12 18.5V22',
  stop: 'M7 7h10v10H7z',
  camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  arrow: 'M5 12h14m0 0-5-5m5 5-5 5',
  back: 'M19 12H5m0 0 5-5m-5 5 5 5',
  volume: 'M4 10v4h3.5L12 18V6L7.5 10H4Zm12.5-1.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  edit: 'm4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1Zm9-13 4 4',
  external: 'M14 4h6v6m0-6L10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3m-8 0 1 13h10l1-13M10 11v6m4-6v6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9.5v.01',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v5m0 3v.01',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z',
  store: 'M4 9.5 5.5 4h13L20 9.5M4 9.5a2.5 2.5 0 0 0 4 2 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4-2M5 12.5V20h14v-7.5M10 20v-5h4v5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  logout: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4m6-4 5-4-5-4m5 4H9',
  bags: 'M6 9h12l-1 11H7L6 9Zm3 0V6.5a3 3 0 0 1 6 0V9',
  tag: 'M3 12V4h8l10 10-8 8L3 12Zm4.5-4h.01',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  bulb: 'M9 18h6m-5.5 3h5M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z',
  party: 'M4 20l4-12 8 8-12 4Zm10-13 2-2m1 5h2m-6-7v2m5 2 1.5-1.5',
  gift: 'M4 10h16v10H4zM12 10v10M4 10V7h16v3M12 7c-2-3-5-3-5 0m5 0c2-3 5-3 5 0',
  book: 'M5 5.5A1.5 1.5 0 0 1 6.5 4H19v15H6.5A1.5 1.5 0 0 0 5 20.5v-15Zm0 0v15M9 8h6',
  trend: 'M4 17l5-5 4 4 7-7M15 9h5v5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 4v4m8-4v4',
  reel: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 5h14M9 4l2 5m3-5 2 5m-5 4.5 4 2.5-4 2.5v-5Z',
  play: 'M8 5.5v13l11-6.5-11-6.5Z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  download: 'M12 4v11m0 0 4.5-4.5M12 15 7.5 10.5M5 19h14',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  mute: 'M4 10v4h3.5L12 18V6L7.5 10H4Zm12 0 5 4m0-4-5 4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#feda75" />
          <stop offset="0.35" stopColor="#fa7e1e" />
          <stop offset="0.6" stopColor="#d62976" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="url(#ig-g)" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="url(#ig-g)" strokeWidth="2" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="url(#ig-g)" />
    </svg>
  )
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a76ff" />
          <stop offset="1" stopColor="#6a3ce0" />
        </linearGradient>
      </defs>
      <path d="M6 30 58 8 44 56 30 40 6 30Z" fill="url(#logo-g)" />
      <path d="M30 40 58 8 36 44Z" fill="#d9ccff" />
    </svg>
  )
}
