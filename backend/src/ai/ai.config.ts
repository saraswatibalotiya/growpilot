import { ConfigService } from '@nestjs/config';

/**
 * The single place AI settings are read. Model IDs come from the environment (CLAUDE_SONNET_MODEL and
 * CLAUDE_HAIKU_MODEL). The defaults below apply only when those variables are unset, so a model can be
 * changed without touching application code.
 */
export interface AiConfig {
  apiKey: string | undefined;
  sonnetModel: string;
  haikuModel: string;
  haikuTimeoutMs: number;
  sonnetTimeoutMs: number;
  /** Retries for 408/429/5xx and connection errors, with the SDK's exponential backoff. */
  maxRetries: number;
  haikuMaxTokens: number;
  sonnetMaxTokens: number;
  maxTranscriptChars: number;
  maxInstructionChars: number;
  /** Hosts Claude may fetch images from. Anything else is rejected before a request is made. */
  trustedImageHosts: string[];
  /** Cloudinary cloud name; image paths must start with /<cloud>/image/upload/. */
  cloudName: string | undefined;
  maxImageBytes: number;
  promptVersion: string;
}

const DEFAULT_SONNET = 'claude-sonnet-5';
const DEFAULT_HAIKU = 'claude-haiku-4-5-20251001';

const int = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function readAiConfig(config: ConfigService): AiConfig {
  const hosts = (config.get<string>('AI_TRUSTED_IMAGE_HOSTS') ?? 'res.cloudinary.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return {
    apiKey: config.get<string>('ANTHROPIC_API_KEY') || undefined,
    sonnetModel: config.get<string>('CLAUDE_SONNET_MODEL') || DEFAULT_SONNET,
    haikuModel: config.get<string>('CLAUDE_HAIKU_MODEL') || DEFAULT_HAIKU,
    haikuTimeoutMs: int(config.get<string>('AI_HAIKU_TIMEOUT_MS'), 20_000, 1_000, 120_000),
    sonnetTimeoutMs: int(config.get<string>('AI_SONNET_TIMEOUT_MS'), 60_000, 1_000, 300_000),
    maxRetries: int(config.get<string>('AI_MAX_RETRIES'), 2, 0, 5),
    haikuMaxTokens: 2_048,
    sonnetMaxTokens: 8_192,
    maxTranscriptChars: 2_000,
    maxInstructionChars: 1_000,
    trustedImageHosts: hosts,
    cloudName: config.get<string>('CLOUDINARY_CLOUD_NAME') || undefined,
    maxImageBytes: 5 * 1024 * 1024,
    promptVersion: 'v1',
  };
}
