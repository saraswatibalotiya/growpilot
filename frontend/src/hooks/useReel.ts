import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../lib/api'
import { isBuilding } from '../lib/reels'
import { getReel, getReelStatus, type Reel, type ReelStatusInfo } from '../services/reels'

const POLL_MS = 2000

/** Polls the cheap status endpoint until the reel stops being built. Timers are cleared on unmount. */
export function useReelStatus(id: string | undefined, restart = 0) {
  const [info, setInfo] = useState<ReelStatusInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const ctl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let again = true
      try {
        const next = await getReelStatus(id, ctl.signal)
        setInfo(next)
        setError(null)
        again = isBuilding(next.status)
      } catch (e) {
        if (ctl.signal.aborted) return
        setError(errorMessage(e))
        again = !(e instanceof ApiError && (e.status === 404 || e.status === 400))
      }
      if (again && !ctl.signal.aborted) timer = setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => {
      ctl.abort()
      clearTimeout(timer)
    }
  }, [id, restart])

  return { info, error }
}

/** Loads a reel and keeps refreshing it while `keepPolling(reel)` is true. */
export function useReel(id: string | undefined, keepPolling?: (r: Reel) => boolean) {
  const [reel, setReel] = useState<Reel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const poll = useRef(keepPolling)
  useEffect(() => {
    poll.current = keepPolling
  })

  useEffect(() => {
    if (!id) return
    const ctl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      let again = false
      try {
        const next = await getReel(id, ctl.signal)
        setReel(next)
        setError(null)
        again = poll.current?.(next) ?? false
      } catch (e) {
        if (ctl.signal.aborted) return
        setError(errorMessage(e))
      } finally {
        if (!ctl.signal.aborted) setLoading(false)
      }
      if (again && !ctl.signal.aborted) timer = setTimeout(() => void load(), POLL_MS)
    }
    void load()
    return () => {
      ctl.abort()
      clearTimeout(timer)
    }
  }, [id, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { reel, setReel, error, loading, reload }
}
