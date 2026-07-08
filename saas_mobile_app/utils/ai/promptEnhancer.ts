/**
 * Prompt Enhancer — Grammar & clarity improvement via Groq LLM
 */

/* Variables for Groq removed, now using backend API */

export async function enhancePrompt(text: string): Promise<string | null> {
  if (!text.trim() || text.trim().length < 3) return null;

  const apiUrl = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL;
  if (!apiUrl) {
    console.warn('[PromptEnhancer] EXPO_PUBLIC_MOBILE_SERVER_URL missing');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${apiUrl}/api/ai/enhance-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    return data.text || null;
  } catch (err) {
    console.warn('[PromptEnhancer] Enhancement failed:', err);
    return null;
  }
}
