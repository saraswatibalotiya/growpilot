import { NotAvailableError, request } from '../lib/api'
import { translate } from '../i18n'
import { features } from '../lib/features'
import type { Post } from '../lib/types'

/**
 * Publishing is real or it does not happen. There is no mock path.
 *   POST /posts/:id/publish { confirm: true } -> Post with status PUBLISHED, instagramMediaId and publishedAt set.
 * `confirm` records that the owner pressed the publish button. The server still checks everything else
 * (it is switched on, the post is approved, the account is allowlisted, the photo is not a duplicate).
 */
export async function publishPost(postId: string, format: 'post' | 'reel' = 'post'): Promise<Post> {
  if (!features.publishing) {
    throw new NotAvailableError(translate('post.publish.notSwitchedOn'))
  }
  return request<Post>(`/posts/${postId}/publish`, { method: 'POST', body: { confirm: true, format } })
}
