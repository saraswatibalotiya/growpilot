/** Post lifecycle. The client can only approve (PREVIEW_READY -> USER_APPROVED) or reopen an approved draft (USER_APPROVED -> PREVIEW_READY); everything else is the server's job. */
export const POST_STATUSES = [
  'DRAFT',
  'CONTENT_GENERATED',
  'PREVIEW_READY',
  'USER_APPROVED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  DRAFT: ['CONTENT_GENERATED', 'FAILED'],
  CONTENT_GENERATED: ['PREVIEW_READY', 'FAILED'],
  PREVIEW_READY: ['USER_APPROVED', 'CONTENT_GENERATED', 'FAILED'],
  USER_APPROVED: ['PUBLISHING', 'PREVIEW_READY'], // back to PREVIEW_READY: the owner reopens an approved draft to edit it
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: [],
  FAILED: ['DRAFT'],
};

/** Caption, headline, CTA, hashtags, language and poster may change only before approval. */
export const EDITABLE_STATUSES: readonly PostStatus[] = ['DRAFT', 'CONTENT_GENERATED', 'PREVIEW_READY'];

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
