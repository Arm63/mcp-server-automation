"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const p_retry_1 = __importDefault(require("p-retry"));
class AIService {
    constructor() {
        this.model = process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey)
            throw new Error('CLAUDE_API_KEY is missing in environment');
        this.anthropic = new sdk_1.default({ apiKey });
    }
    async generateTestCode(prompt) {
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
        return (0, p_retry_1.default)(attempt, { retries: 2 });
    }
    extractCode(text) {
        const fenced = text.match(/```(?:ts|typescript)?\n([\s\S]*?)\n```/i);
        return fenced?.[1]?.trim() || text.trim();
    }
}
exports.AIService = AIService;
