import { ConfigService } from '@nestjs/config';
import { ModelRouterService, type AiTask } from './model-router.service';

const router = (env: Record<string, string> = {}) => new ModelRouterService(new ConfigService(env));

describe('ModelRouterService', () => {
  it('sends lightweight tasks to Haiku and content tasks to Sonnet', () => {
    const r = router({ CLAUDE_HAIKU_MODEL: 'haiku-x', CLAUDE_SONNET_MODEL: 'sonnet-x' });
    for (const task of ['intent', 'edit-plan', 'summary'] as AiTask[]) expect(r.route(task)).toMatchObject({ tier: 'haiku', model: 'haiku-x' });
    for (const task of ['image-analysis', 'content', 'edit'] as AiTask[]) expect(r.route(task)).toMatchObject({ tier: 'sonnet', model: 'sonnet-x' });
  });

  it('reads model IDs from the environment so they can change without code changes', () => {
    expect(router({ CLAUDE_SONNET_MODEL: 'claude-sonnet-5-5' }).route('content').model).toBe('claude-sonnet-5-5');
    expect(router({ CLAUDE_HAIKU_MODEL: 'claude-haiku-5-5' }).route('intent').model).toBe('claude-haiku-5-5');
  });

  it('never routes a Sonnet task to the Haiku model', () => {
    const r = router({ CLAUDE_HAIKU_MODEL: 'haiku-x', CLAUDE_SONNET_MODEL: 'sonnet-x' });
    for (const task of ['image-analysis', 'content', 'edit'] as AiTask[]) expect(r.route(task).model).not.toBe('haiku-x');
  });

  it('gives Sonnet a longer timeout than Haiku', () => {
    const r = router();
    expect(r.route('content').timeoutMs).toBeGreaterThan(r.route('intent').timeoutMs);
  });
});
