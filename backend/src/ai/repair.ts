import { BadGatewayException } from '@nestjs/common';
import { AiOutputInvalidError } from './claude-provider.service';

/**
 * Runs a model call, checks the result, and allows at most ONE repair attempt that tells the model what was
 * wrong. If the second attempt is still bad, a safe error is returned instead of unreliable content.
 * HTTP errors (auth, rate limit, timeout) pass straight through: they are not repaired.
 */
export async function withRepair<T>(attempt: (repairNote: string | null) => Promise<T>, check: (value: T) => string | null): Promise<T> {
  let note: string | null = null;
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      const value = await attempt(note);
      const problem = check(value);
      if (!problem) return value;
      note = problem;
    } catch (error) {
      if (!(error instanceof AiOutputInvalidError)) throw error;
      note = `${error.message}. Return a complete result that matches the required structure.`;
    }
  }
  throw new BadGatewayException('The AI could not produce a reliable result. Please try again.');
}
