"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const testiny_service_1 = require("../services/testiny.service");
const prompt_service_1 = require("../services/prompt.service");
const ai_service_1 = require("../services/ai.service");
const runner_service_1 = require("../services/runner.service");
console.log('✅ test-cases.ts: Module loaded');
const router = (0, express_1.Router)();
const testiny = new testiny_service_1.TestinyService();
const promptSvc = new prompt_service_1.PromptService();
const aiSvc = new ai_service_1.AIService();
const runner = new runner_service_1.RunnerService();
// Helper: decide if TC is automation candidate
const isAutomationCandidate = (labels = []) => {
    return labels.includes('automation:required') || labels.includes('automation:recommended');
};
/**
 * GET /api/test-cases/:id/generate
 * Optional query param: ?target=pytest-appium-ios|appium-js
 */
router.get('/test-cases/:id/generate', async (req, res) => {
    const { id } = req.params;
    const target = req.query.target || 'pytest-appium-ios';
    const save = String(req.query.save || 'true') === 'true';
    const run = String(req.query.run || 'false') === 'true';
    const force = String(req.query.force || 'false') === 'true';
    const mock = String(req.query.mock || 'false') === 'true';
    const allowFallback = String(req.query.allowFallback || 'true') === 'true';
    const includeRaw = String(req.query.raw || 'false') === 'true';
    try {
        const tc = await testiny.getTestCase(id);
        const tcRaw = includeRaw ? await testiny.getTestCaseRaw(id) : undefined;
        const debug = includeRaw ? testiny.getDebugInfo?.() : undefined;
        if (!force && !isAutomationCandidate(tc.labels)) {
            return res.status(400).json({
                error: 'Test case not flagged for automation. Add label: automation:required'
            });
        }
        // Select prompt variant by target
        const prompt = promptSvc.generatePrompt(tc, target);
        // Use mock generator when explicitly requested
        let generated;
        if (mock) {
            generated = promptSvc.generateSimpleTest(tc, target);
        }
        else {
            try {
                generated = await aiSvc.generateTestCode(prompt);
            }
            catch (e) {
                const msg = e?.message ?? '';
                const creditError = /credit balance is too low|insufficient.*credit/i.test(JSON.stringify(e) + msg);
                if (allowFallback && creditError) {
                    generated = promptSvc.generateSimpleTest(tc, target);
                }
                else {
                    throw e;
                }
            }
        }
        // Basic post-processing: strip leading/trailing triple backticks (any language tag)
        const cleaned = generated
            .replace(/^\s*```[a-zA-Z]*\s*/i, '')
            .replace(/\s*```\s*$/, '')
            .trim();
        let savedPath;
        let runResult;
        if (save) {
            savedPath = await runner.saveGeneratedTest({ code: cleaned, testCaseId: tc.id, target });
        }
        if (run && savedPath) {
            runResult = await runner.runSavedTest(savedPath);
        }
        res.status(200).json({
            testCase: tc,
            ...(includeRaw ? { testCaseRaw: tcRaw, debug } : {}),
            generatedScript: cleaned,
            savedPath,
            runResult,
            meta: {
                target,
                generatedAt: new Date().toISOString()
            }
        });
    }
    catch (err) {
        console.error('Error generating test:', err?.message ?? err);
        res.status(500).json({ error: 'Failed to generate test case', detail: err?.message ?? String(err) });
    }
});
exports.default = router;
// Raw fetch endpoint for debugging
router.get('/test-cases/:id/raw', async (req, res) => {
    const { id } = req.params;
    try {
        const raw = await testiny.getTestCaseRaw(id);
        const debug = testiny.getDebugInfo?.();
        res.status(200).json({ raw, debug });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch raw test case', detail: err?.message ?? String(err) });
    }
});
