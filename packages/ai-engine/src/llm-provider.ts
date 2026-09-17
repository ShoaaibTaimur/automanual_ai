import OpenAI from 'openai';

export interface LLMProviderConfig {
  name: 'gemini' | 'groq' | 'openai';
  apiKey: string;
  baseURL?: string;
  model: string;
}

export class ResilientLLM {
  private providers: LLMProviderConfig[] = [];
  private clients: Map<string, OpenAI> = new Map();

  constructor() {
    this.refreshProviders();
  }

  public refreshProviders() {
    this.providers = [];
    this.clients.clear();

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    // 1. Groq (Free tier — confirmed working models: openai/gpt-oss-120b)
    if (groqKey && groqKey.length > 5 && !groqKey.includes('your-')) {
      this.providers.push({
        name: 'groq',
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-120b',
      });
    }

    // 2. Google Gemini (Free tier — requires a valid AIza... key from aistudio.google.com)
    if (geminiKey && geminiKey.length > 5 && !geminiKey.includes('your-') && geminiKey.startsWith('AIza')) {
      this.providers.push({
        name: 'gemini',
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-1.5-flash',
      });
    }

    // 3. OpenAI (Optional paid fallback)
    if (openaiKey && openaiKey.length > 5 && !openaiKey.includes('your-')) {
      this.providers.push({
        name: 'openai',
        apiKey: openaiKey,
        model: 'gpt-4o-mini',
      });
    }

    // Initialize OpenAI-compatible clients
    for (const p of this.providers) {
      const client = new OpenAI({
        apiKey: p.apiKey,
        baseURL: p.baseURL,
      });
      this.clients.set(p.name, client);
    }
  }

  public hasAvailableProvider(): boolean {
    this.refreshProviders();
    return this.providers.length > 0;
  }

  public getActiveProviders(): string[] {
    this.refreshProviders();
    return this.providers.map(p => `${p.name} (${p.model})`);
  }

  /**
   * Execute chat completion requesting JSON with automatic failover across providers.
   * Always refreshes provider list to pick up env vars set after module init.
   */
  async completeJSON<T>(
    prompt: string,
    systemPrompt: string = 'You produce structured JSON responses.',
    temperature: number = 0.2
  ): Promise<T> {
    // Always refresh — NestJS ConfigModule sets env vars after module init,
    // so the singleton may have loaded with empty env. Refresh is cheap.
    this.refreshProviders();

    if (this.providers.length === 0) {
      throw new Error('No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY in .env.');
    }

    let lastError: Error | null = null;

    // Try each provider in sequence, with exponential backoff for rate-limit errors
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const client = this.clients.get(provider.name);

      if (!client) continue;

      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          console.log(
            `[AI Engine] Invoking provider: ${provider.name.toUpperCase()} (model: ${provider.model})` +
            (attempt > 0 ? ` [retry ${attempt}/${MAX_RETRIES - 1}]` : '') + '...'
          );

          const response = await client.chat.completions.create({
            model: provider.model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature,
          });

          const rawContent = response.choices[0]?.message?.content;
          if (!rawContent) {
            throw new Error(`Empty content returned by provider ${provider.name}`);
          }

          const parsed = JSON.parse(rawContent) as T;
          console.log(`[AI Engine] ✓ Success with ${provider.name.toUpperCase()} (model: ${provider.model})!`);
          return parsed;
        } catch (err: any) {
          lastError = err;
          const errMsg: string = err.message || String(err);
          const status: number = err.status || err.response?.status || 0;
          const isRateLimit = status === 429 || /rate.?limit|quota|too many/i.test(errMsg);

          if (isRateLimit && attempt < MAX_RETRIES - 1) {
            // Exponential backoff: 1s, 2s, 4s
            const backoffMs = Math.pow(2, attempt) * 1000;
            console.warn(
              `[AI Engine] ${provider.name.toUpperCase()} rate-limited. Backing off ${backoffMs}ms before retry ${attempt + 1}/${MAX_RETRIES - 1}...`
            );
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          // Non-retriable error or exhausted retries → failover to next provider
          console.warn(
            `[AI Engine Fallback] Provider ${provider.name.toUpperCase()} failed (${errMsg}). ` +
            (i < this.providers.length - 1
              ? `Failing over to ${this.providers[i + 1].name.toUpperCase()}...`
              : `No remaining providers.`)
          );
          break; // Break inner retry loop, try next provider
        }
      }
    }

    throw lastError || new Error('All AI providers exhausted without successful response.');
  }
}

// Global singleton instance
export const resilientLLM = new ResilientLLM();
