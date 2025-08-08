import { AIService } from '../../src/services/ai.service';

describe('AIService', () => {
  it('should extract code from fenced blocks', () => {
    const aiService = new AIService();
    const text = '```ts\nconst test = "hello";\n```';
    const extracted = (aiService as any).extractCode(text);
    expect(extracted).toBe('const test = "hello";');
  });
});
