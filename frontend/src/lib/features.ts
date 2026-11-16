/**
 * Feature flags for backend capabilities that are not shipped yet. Flip them in .env when the backend adds
 * the endpoint. While a flag is off, the UI uses a clearly labelled demo or a clear "not available" message.
 */
const on = (value: string | undefined) => value === 'true'

export const features = {
  /** POST /posts/:id/publish exists on the backend (gated publisher). */
  publishing: on(import.meta.env.VITE_FEATURE_PUBLISHING),
}
