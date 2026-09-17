import OpenAI from 'openai';

export interface LLMProviderConfig {
  name: 'gemini' | 'groq' | 'openai';
  apiKey: string;
  baseURL?: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

    // 1. Google Gemini (Free tier, fast, high quality)
    if (geminiKey && geminiKey.length > 5 && !geminiKey.includes('your-')) {
      this.providers.push({
        name: 'gemini',
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-1.5-flash',
      });
    }

    // 2. Groq (Free tier, ultra-fast Llama 3.3)
    if (groqKey && groqKey.length > 5 && !groqKey.includes('your-')) {
      this.providers.push({
        name: 'groq',
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
      });
    }

    // 3. OpenAI (Standard fallback if key supplied)
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
    return this.providers.length > 0;
  }

  public getActiveProviders(): string[] {
    return this.providers.map(p => `${p.name} (${p.model})`);
  }

  /**
   * Execute chat completion requesting JSON with automatic failover across providers.
   * If Gemini rate limits or quotas out (429/quota/5xx), it seamlessly falls back to Groq, and vice-versa.
   */
  async completeJSON<T>(
    prompt: string,
    systemPrompt: string = 'You produce structured JSON responses.',
    temperature: number = 0.2
  ): Promise<T> {
    if (this.providers.length === 0) {
      this.refreshProviders();
    }

    if (this.providers.length === 0) {
      throw new Error('No AI provider configured. Provide GEMINI_API_KEY or GROQ_API_KEY or OPENAI_API_KEY in .env.');
    }

    let lastError: Error | null = null;

    // Try each provider in sequence
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const client = this.clients.get(provider.name);

      if (!client) continue;

      try {
        console.log(`[AI Engine] Invoking provider: ${provider.name.toUpperCase()} (model: ${provider.model})...`);

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
        console.log(`[AI Engine] Success with ${provider.name.toUpperCase()}!`);
        return parsed;
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || String(err);
        const isRateLimitOrQuota = 
          errMsg.includes('429') || 
          errMsg.toLowerCase().includes('quota') || 
          errMsg.toLowerCase().includes('rate limit') || 
          errMsg.toLowerCase().includes('resource_exhausted') ||
          errMsg.toLowerCase().includes('tokens per minute') ||
          errMsg.toLowerCase().includes('credit');

        console.warn(
          `[AI Engine Fallback] Provider ${provider.name.toUpperCase()} encountered an issue (${errMsg}). ` +
          (i < this.providers.length - 1
            ? `Automatically failing over to ${this.providers[i + 1].name.toUpperCase()}...`
            : `No remaining providers to failover to.`)
        );
      }
    }

    throw lastError || new Error('All AI providers exhausted without successful response.');
  }
}

// Global singleton instance
export const resilientLLM = new ResilientLLM();
