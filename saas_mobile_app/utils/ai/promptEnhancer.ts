/**
 * Prompt Enhancer — Grammar & clarity improvement via Groq LLM
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export async function enhancePrompt(text: string): Promise<string | null> {
  if (!text.trim() || text.trim().length < 3) return null;

  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[PromptEnhancer] GROQ_API_KEY missing');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a concise grammar and writing assistant. Take the user\'s ticket description and fix only grammar, spelling, and sentence structure. Keep the original meaning, facts, and length. Do NOT add new details, do NOT expand the description, do NOT rewrite it as a full ticket, and do NOT add bullet points or facility context. Return ONLY the corrected text with no preamble or quotes.',
          },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Clean up any surrounding quotes the model might add
    return content.replace(/^["']|["']$/g, '').trim();
  } catch (err) {
    console.warn('[PromptEnhancer] Enhancement failed:', err);
    return null;
  }
}
