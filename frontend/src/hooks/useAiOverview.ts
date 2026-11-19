import { useCallback, useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../lib/api'
import { sectionKindFor, type SectionKind } from '../lib/aiOverview'
import { createAiMockDataset, type AiMockIndustry } from '../mocks/aiInsights'
import {
  generateRecommendations,
  getAiStatus,
  getAudience,
  getTrends,
  listRecommendations,
  runAnalysis,
  sendFeedback,
  type AiContext,
  type AiStatus,
  type AnalyticsReport,
  type AudienceInsights,
  type FeedbackAction,
  type Recommendation,
  type TrendAnalysis,
} from '../services/aiInsights'

export type Section<T> = { kind: 'loading' } | { kind: 'ready'; data: T } | { kind: Exclude<SectionKind, 'ready'>; message: string }

const loading = { kind: 'loading' } as const

function failed<T>(error: unknown): Section<T> {
  const status = error instanceof ApiError ? error.status : 500
  return { kind: sectionKindFor(status), message: errorMessage(error) }
}

/** Whether the AI features are on for this deployment. Anything but a clear "enabled" means they stay hidden. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    void getAiStatus().then((s) => !cancelled && setStatus(s))
    return () => {
      cancelled = true
    }
  }, [])
  return status
}

export interface AiOverview {
  analysis: Section<AnalyticsReport>
  audience: Section<AudienceInsights>
  trends: Section<TrendAnalysis>
  recommendations: Section<Recommendation[]>
  context: AiContext | null
  generating: boolean
  generateError: string | null
  /** Recommendation ids the owner has already acted on in this visit, with what they chose. */
  acted: Record<string, FeedbackAction>
  reload: () => void
  generate: () => Promise<void>
  feedback: (id: string, action: FeedbackAction) => Promise<void>
}

export function useMockAiOverview(industry: AiMockIndustry): AiOverview {
  const [data, setData] = useState(() => createAiMockDataset(industry))
  const [acted, setActed] = useState<Record<string, FeedbackAction>>({})
  const reset = () => {
    setData(createAiMockDataset(industry))
    setActed({})
  }
  return {
    analysis: { kind: 'ready', data: data.analysis },
    audience: { kind: 'ready', data: data.audience },
    trends: { kind: 'ready', data: data.trends },
    recommendations: { kind: 'ready', data: data.recommendations },
    context: null,
    generating: false,
    generateError: null,
    acted,
    reload: reset,
    generate: async () => reset(),
    feedback: async (id, action) => setActed((previous) => ({ ...previous, [id]: action })),
  }
}

/** Loads every section independently, so one that fails or has no data yet never blanks the others. */
export function useAiOverview(enabled: boolean): AiOverview {
  const [analysis, setAnalysis] = useState<Section<AnalyticsReport>>(loading)
  const [audience, setAudience] = useState<Section<AudienceInsights>>(loading)
  const [trends, setTrends] = useState<Section<TrendAnalysis>>(loading)
  const [recommendations, setRecommendations] = useState<Section<Recommendation[]>>(loading)
  const [context, setContext] = useState<AiContext | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [acted, setActed] = useState<Record<string, FeedbackAction>>({})
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const { signal } = controller
    setAnalysis(loading)
    setAudience(loading)
    setTrends(loading)
    setRecommendations(loading)

    // The analysis call also refreshes the engine's copy of the owner's posts, so it runs first; the rest only read.
    void runAnalysis(signal)
      .then((r) => {
        if (signal.aborted) return
        setAnalysis({ kind: 'ready', data: r.analysis })
        setContext(r.context)
      })
      .catch((e: unknown) => !signal.aborted && setAnalysis(failed(e)))
      .then(() => {
        if (signal.aborted) return
        void getAudience(signal)
          .then((d) => !signal.aborted && setAudience({ kind: 'ready', data: d }))
          .catch((e: unknown) => !signal.aborted && setAudience(failed(e)))
        void getTrends(signal)
          .then((d) => !signal.aborted && setTrends({ kind: 'ready', data: d }))
          .catch((e: unknown) => !signal.aborted && setTrends(failed(e)))
        void listRecommendations(signal)
          .then((d) => !signal.aborted && setRecommendations({ kind: 'ready', data: d.items }))
          .catch((e: unknown) => !signal.aborted && setRecommendations(failed(e)))
      })
    return () => controller.abort()
  }, [enabled, tick])

  const reload = useCallback(() => {
    void getAiStatus(true)
    setTick((n) => n + 1)
  }, [])

  const generate = useCallback(async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      const result = await generateRecommendations(4)
      setRecommendations({ kind: 'ready', data: result.recommendations })
      setContext(result.context)
      setActed({})
    } catch (e) {
      setGenerateError(errorMessage(e))
    } finally {
      setGenerating(false)
    }
  }, [])

  const feedback = useCallback(async (id: string, action: FeedbackAction) => {
    setActed((prev) => ({ ...prev, [id]: action }))
    try {
      await sendFeedback(id, action)
    } catch (e) {
      setActed((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setGenerateError(errorMessage(e))
    }
  }, [])

  return { analysis, audience, trends, recommendations, context, generating, generateError, acted, reload, generate, feedback }
}
