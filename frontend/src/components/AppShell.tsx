import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { translate, useT } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { Icon, InstagramGlyph, Logo, type IconName } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'

const NAV: { to: string; labelKey: string; icon: IconName; end?: boolean }[] = [
  { to: '/', labelKey: 'shell.nav.home', icon: 'home', end: true },
  { to: '/create', labelKey: 'shell.nav.createPost', icon: 'plus' },
  { to: '/reels', labelKey: 'shell.nav.createReel', icon: 'reel' },
  { to: '/posts', labelKey: 'shell.nav.myPosts', icon: 'posts' },
  { to: '/products', labelKey: 'shell.nav.products', icon: 'box' },
  { to: '/settings', labelKey: 'shell.nav.settings', icon: 'settings' },
]

const TITLE_KEYS: Record<string, string> = {
  '/': 'home',
  '/posts': 'myPosts',
  '/products': 'products',
  '/settings': 'settings',
  '/help': 'help',
  '/recommendations': 'ideas',
  '/create': 'create',
  '/create/generating': 'generating',
  '/create/preview': 'preview',
  '/create/publish': 'publish',
  '/create/done': 'published',
  '/reels': 'reels',
  '/reels/library': 'reelLibrary',
}

function titleFor(pathname: string): string {
  const key = TITLE_KEYS[pathname]
  if (key) return translate(`shell.titles.${key}`)
  const tail = /^\/reels\/[^/]+\/(\w+)$/.exec(pathname)?.[1]
  const reel: Record<string, string> = { generating: 'reelGenerating', edit: 'reelEdit', publish: 'reelPublish', published: 'reelStatus' }
  if (tail) return translate(`shell.titles.${reel[tail] ?? 'app'}`)
  return translate(/^\/reels\/[^/]+$/.test(pathname) ? 'shell.titles.reelPreview' : 'shell.titles.app')
}

export function AppShell() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="shell">
      {open ? <div className="scrim" onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label={t('shell.main')}>
        <Link to="/" className="brand">
          <Logo />
          GrowPilot
        </Link>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-note">{t('shell.sidebarNote')}</div>
          <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon name="help" />
            {t('shell.titles.help')}
          </NavLink>
        </div>
      </aside>
      <div className="main">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const t = useT()
  const { pathname } = useLocation()
  const { user, business, instagram, signOut } = useAuth()
  const [menu, setMenu] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const title = titleFor(pathname)
  const initial = (user?.name ?? business?.name ?? 'G').charAt(0).toUpperCase()

  const ig =
    instagram.state === 'connected'
      ? { cls: 'is-connected', text: t('shell.ig.connected', { name: instagram.account.username ?? t('shell.ig.account') }) }
      : instagram.state === 'problem'
        ? { cls: 'is-problem', text: t('shell.ig.problem') }
        : instagram.state === 'none'
          ? { cls: '', text: t('shell.ig.none') }
          : { cls: '', text: t('shell.ig.checking') }

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="menu-btn" onClick={onMenu} aria-label={t('shell.openMenu')}>
          <Icon name="menu" />
        </button>
        <span className="topbar-title">{title}</span>
      </div>
      <div className="topbar-actions">
        <LanguageSwitcher />
        <Link to="/settings" className={`ig-status ${ig.cls}`} title={t('shell.ig.title')}>
          <span className="dot" />
          <InstagramGlyph size={16} />
          <span>{ig.text}</span>
        </Link>
        <div className="menu-wrap" ref={wrap}>
          <button type="button" className="avatar" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label={t('shell.accountMenu')}>
            {initial}
          </button>
          {menu ? (
            <div className="menu" role="menu">
              <div className="menu-head">
                <strong style={{ color: 'var(--text)' }}>{user?.name ?? t('shell.yourAccount')}</strong>
                <br />
                {user?.email}
              </div>
              <button type="button" className="menu-item" role="menuitem" onClick={() => navigate('/settings')}>
                {t('shell.nav.settings')}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={async () => {
                  await signOut()
                  navigate('/welcome')
                }}
              >
                {t('shell.signOut')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
