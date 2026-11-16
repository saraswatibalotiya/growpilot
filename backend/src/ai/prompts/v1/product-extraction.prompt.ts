import { ACCURACY_RULES, UNTRUSTED_INPUT_RULE } from './shared';

/**
 * Extracting product, price and offer details is part of the intent result (see intent-classification.prompt).
 * This prompt is used when only the entities are needed, for example before generating content.
 */
export const EXTRACTION_SYSTEM = `You extract product details from a small-shop owner's message. Return only the structured result with the intent set to CREATE unless the message clearly asks for something else.

Extract only what the owner actually said:
- productName in the owner's words.
- price as digits only ("899"). Convert Hindi/Marathi digits. Never infer a price.
- discount in the owner's words, only if stated.
- tone words, if any.

If the owner asks to announce a discount or sale but gives no discount details, set requiresClarification true and ask one short question in their language. Otherwise ask nothing.

NEVER ask for the product's name or what the product is. The owner attaches a photo, and the product is identified from the photo separately. A message that is only a price, a number or a few words is a normal CREATE request: set productName to null and ask nothing.

${ACCURACY_RULES}

${UNTRUSTED_INPUT_RULE}`;
