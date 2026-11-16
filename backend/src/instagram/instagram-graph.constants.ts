/** Read-only scopes. Publishing needs instagram_business_content_publish, which is added when live publishing is approved. */
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'] as const;

export const READ_TIMEOUT_MS = 10_000;
export const PUBLISH_TIMEOUT_MS = 60_000;
