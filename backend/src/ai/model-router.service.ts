import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readAiConfig } from './ai.config';

/**
 * Every AI task and the model tier it uses. Light, well-defined tasks go to Haiku; anything that needs
 * judgement, vision or good writing goes to Sonnet. There is deliberately no Sonnet -> Haiku fallback:
 * if Sonnet is unavailable the request fails clearly instead of returning weaker marketing copy.
 */
export type AiTask =
  | 'intent' // classify what the owner wants and pull out entities
  | 'edit-plan' // understand an editing instruction
  | 'summary' // compact conversation summary
  | 'image-analysis'
  | 'photo-analysis' // product photo quality and category for the Photo Studio
  | 'poster-design' // how a poster should look, from the product photo
  | 'poster-edit' // a short instruction about the poster (colours, template, price badge)
  | 'reel-script' // voiceover script, scene text, caption and hashtags for a Reel
  | 'content' // new caption, headline, CTA, hashtags, poster spec
  | 'edit'; // modify an existing draft

type Tier = 'haiku' | 'sonnet';

const TIER: Record<AiTask, Tier> = {
  intent: 'haiku',
  'edit-plan': 'haiku',
  summary: 'haiku',
  'image-analysis': 'sonnet',
  'photo-analysis': 'sonnet',
  'poster-design': 'sonnet',
  'poster-edit': 'haiku',
  'reel-script': 'sonnet',
  content: 'sonnet',
  edit: 'sonnet',
};

export interface Route {
  tier: Tier;
  model: string;
  timeoutMs: number;
  maxTokens: number;
}

@Injectable()
export class ModelRouterService {
  constructor(private readonly config: ConfigService) {}

  route(task: AiTask): Route {
    const cfg = readAiConfig(this.config);
    const tier = TIER[task];
    return tier === 'haiku'
      ? { tier, model: cfg.haikuModel, timeoutMs: cfg.haikuTimeoutMs, maxTokens: cfg.haikuMaxTokens }
      : { tier, model: cfg.sonnetModel, timeoutMs: cfg.sonnetTimeoutMs, maxTokens: cfg.sonnetMaxTokens };
  }
}
