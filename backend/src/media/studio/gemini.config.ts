import { ConfigService } from '@nestjs/config';

/** The single place Gemini settings are read. Gemini stays off unless GEMINI_API_KEY is set. */
export interface GeminiConfig {
  apiKey: string | undefined;
  /** Default (cheaper) image model. */
  model: string;
  /** Used only when the caller asks for premium quality. */
  premiumModel: string;
  timeoutMs: number;
  /** Gemini generations allowed per business per UTC day. 0 disables Gemini without removing the key. */
  dailyLimitPerBusiness: number;
  /** Estimated charge per image, recorded for usage tracking. */
  costPerImageUsd: number;
  premiumCostPerImageUsd: number;
  baseUrl: string;
}

const int = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function readGeminiConfig(config: ConfigService): GeminiConfig {
  return {
    apiKey: config.get<string>('GEMINI_API_KEY') || undefined,
    model: config.get<string>('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-lite-image',
    premiumModel: config.get<string>('GEMINI_IMAGE_PREMIUM_MODEL') || 'gemini-3.1-flash-image',
    timeoutMs: int(config.get<string>('GEMINI_TIMEOUT_MS'), 90_000, 5_000, 300_000),
    dailyLimitPerBusiness: int(config.get<string>('GEMINI_DAILY_LIMIT_PER_BUSINESS'), 10, 0, 1_000),
    costPerImageUsd: num(config.get<string>('GEMINI_COST_PER_IMAGE_USD'), 0.02),
    premiumCostPerImageUsd: num(config.get<string>('GEMINI_PREMIUM_COST_PER_IMAGE_USD'), 0.04),
    baseUrl: config.get<string>('GEMINI_API_BASE_URL') || 'https://generativelanguage.googleapis.com/v1beta',
  };
}
