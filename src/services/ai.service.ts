import Anthropic from '@anthropic-ai/sdk';
import pRetry from 'p-retry';

export class AIService {
  private anthropic: Anthropic;
  private model = process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';

  constructor() {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error('CLAUDE_API_KEY is missing in environment');
    this.anthropic = new Anthropic({ apiKey });
  }

  async generateTestCode(prompt: string): Promise<string> {
    const attempt = async () => {
      const msg = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1400,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join('\n');

      return this.extractCode(text);
    };

    return pRetry(attempt, { retries: 2 });
  }

  private extractCode(text: string): string {
    const fenced = text.match(/```(?:ts|typescript)?\n([\s\S]*?)\n```/i);
    return fenced?.[1]?.trim() || text.trim();
  }
}
