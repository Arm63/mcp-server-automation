import { Router } from 'express';
import { TestinyService } from '../services/testiny.service';
import { PromptService } from '../services/prompt.service';
import { AIService } from '../services/ai.service';
import { RunnerService } from '../services/runner.service';

console.log('✅ test-cases.ts: Module loaded');

const router = Router();

const testiny = new TestinyService();
const promptSvc = new PromptService();
const aiSvc = new AIService();
const runner = new RunnerService();

// Helper: decide if TC is automation candidate
const isAutomationCandidate = (labels: string[] = []) => {
  return labels.includes('automation:required') || labels.includes('automation:recommended');
};

/**
 * GET /api/test-cases/:id/generate
 * Optional query param: ?target=pytest-appium-ios|appium-js
 */
router.get('/test-cases/:id/generate', async (req, res) => {
  const { id } = req.params;
  const target = (req.query.target as string) || 'pytest-appium-ios';
  const save = String(req.query.save || 'true') === 'true';
  const run = String(req.query.run || 'false') === 'true';
  const force = String(req.query.force || 'false') === 'true';
  const mock = String(req.query.mock || 'false') === 'true';
  const allowFallback = String(req.query.allowFallback || 'true') === 'true';
  const includeRaw = String(req.query.raw || 'false') === 'true';

  try {
    const tc = await testiny.getTestCase(id);
    const tcRaw = includeRaw ? await testiny.getTestCaseRaw(id) : undefined;
    const debug = includeRaw ? (testiny as any).getDebugInfo?.() : undefined;

    if (!force && !isAutomationCandidate(tc.labels)) {
      return res.status(400).json({
        error: 'Test case not flagged for automation. Add label: automation:required'
      });
    }

    // Select prompt variant by target
    const prompt = promptSvc.generatePrompt(tc, target);

    // Use mock generator when explicitly requested
    let generated: string;
    if (mock) {
      generated = promptSvc.generateSimpleTest(tc, target);
    } else {
      try {
        generated = await aiSvc.generateTestCode(prompt);
      } catch (e: any) {
        const msg: string = e?.message ?? '';
        const creditError = /credit balance is too low|insufficient.*credit/i.test(JSON.stringify(e) + msg);
        if (allowFallback && creditError) {
          generated = promptSvc.generateSimpleTest(tc, target);
        } else {
          throw e;
        }
      }
    }

    // Basic post-processing: strip leading/trailing triple backticks (any language tag)
    const cleaned = generated
      .replace(/^\s*```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let savedPath: string | undefined;
    let runResult: any | undefined;

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
  } catch (err: any) {
    console.error('Error generating test:', err?.message ?? err);
    res.status(500).json({ error: 'Failed to generate test case', detail: err?.message ?? String(err) });
  }
});

export default router;

// Raw fetch endpoint for debugging
router.get('/test-cases/:id/raw', async (req, res) => {
  const { id } = req.params;
  try {
    const raw = await testiny.getTestCaseRaw(id);
    const debug = (testiny as any).getDebugInfo?.();
    res.status(200).json({ raw, debug });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch raw test case', detail: err?.message ?? String(err) });
  }
});
