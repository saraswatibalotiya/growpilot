import type { KeyboardEvent } from 'react'

/** Arrow-key navigation for a role="radiogroup" whose radios use roving tabindex. */
export function radioKeys(e: KeyboardEvent<HTMLElement>): void {
  const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!dir) return
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'))
  const i = radios.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return
  e.preventDefault()
  const next = radios[(i + dir + radios.length) % radios.length]
  next.focus()
  next.click()
}
