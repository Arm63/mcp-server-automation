"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config"); // loads .env automatically
const express_1 = __importDefault(require("express"));
const test_cases_1 = __importDefault(require("./routes/test-cases"));
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '200kb' }));
// Basic health
app.get('/', (req, res) => {
    res.send('🎉 MCP Server is LIVE!');
});
// Mount API routes under /api
app.use('/api', test_cases_1.default);
// Basic 404
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 MCP Server running on http://localhost:${PORT}`);
});
