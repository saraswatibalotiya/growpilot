import { Injectable } from '@nestjs/common';
import {
  CONTENT_SYSTEM,
  EDIT_PLAN_SYSTEM,
  EDIT_SYSTEM,
  EXTRACTION_SYSTEM,
  IMAGE_ANALYSIS_SYSTEM,
  IMAGE_ANALYSIS_USER,
  INTENT_SYSTEM,
  PROMPT_VERSION,
  SUMMARY_SYSTEM,
  contentUser,
  editPlanUser,
  editUser,
  intentUser,
  summaryUser,
  type ContentUserInput,
} from './prompts/v1';

export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * Assembles prompts from the versioned files in prompts/v1. Stable instructions stay in `system`; business facts
 * and the owner's words go in the user turn, so they never change the rules. To change wording, edit the prompt
 * file; to ship a new version, add prompts/v2 and change PROMPT_VERSION here.
 */
@Injectable()
export class PromptBuilderService {
  readonly version = PROMPT_VERSION;

  intent(input: { transcript: string; preferredLanguage: string | null; summary: string | null }): BuiltPrompt {
    return { system: INTENT_SYSTEM, user: intentUser(input) };
  }

  extraction(input: { transcript: string; preferredLanguage: string | null; summary: string | null }): BuiltPrompt {
    return { system: EXTRACTION_SYSTEM, user: intentUser(input) };
  }

  summary(input: Parameters<typeof summaryUser>[0]): BuiltPrompt {
    return { system: SUMMARY_SYSTEM, user: summaryUser(input) };
  }

  imageAnalysis(): BuiltPrompt {
    return { system: IMAGE_ANALYSIS_SYSTEM, user: IMAGE_ANALYSIS_USER };
  }

  content(input: ContentUserInput): BuiltPrompt {
    return { system: CONTENT_SYSTEM, user: contentUser(input) };
  }

  editPlan(input: Parameters<typeof editPlanUser>[0]): BuiltPrompt {
    return { system: EDIT_PLAN_SYSTEM, user: editPlanUser(input) };
  }

  edit(input: Parameters<typeof editUser>[0]): BuiltPrompt {
    return { system: EDIT_SYSTEM, user: editUser(input) };
  }
}
