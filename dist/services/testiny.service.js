"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestinyService = void 0;
const axios_1 = __importDefault(require("axios"));
const TESTINY_API = process.env.TESTINY_API_URL;
const API_KEY = process.env.TESTINY_API_KEY;
const PROJECT_ID = process.env.TESTINY_PROJECT_ID;
if (!TESTINY_API)
    throw new Error('TESTINY_API_URL is missing');
if (!API_KEY)
    throw new Error('TESTINY_API_KEY is missing');
class TestinyService {
    constructor() {
        this.client = axios_1.default.create({
            baseURL: TESTINY_API,
            headers: { 'X-Api-Key': API_KEY },
            timeout: 10000
        });
        // Debug info captured during the latest fetch
        this.lastDebug = { attempts: [] };
    }
    getDebugInfo() {
        return this.lastDebug;
    }
    async getTestCaseRaw(id) {
        try {
            this.lastDebug = { attempts: [] };
            // Normalize possible keys like "TC-2" → numeric id "2"
            const numericId = id.match(/\d+/)?.[0];
            // Try a few known path variants to be resilient to API base prefixes
            const candidatePaths = [
                `/testcase/${id}`,
                numericId ? `/testcase/${numericId}` : undefined,
                `/testcases/${id}`,
                numericId ? `/testcases/${numericId}` : undefined,
                `/test-cases/${id}`,
                numericId ? `/test-cases/${numericId}` : undefined,
            ].filter(Boolean);
            let data;
            let lastErr;
            for (const p of candidatePaths) {
                try {
                    const res = await this.client.get(p, { params: { omitLargeValues: false } });
                    this.lastDebug.attempts.push({ method: 'GET', path: p, status: res.status });
                    data = res.data;
                    break;
                }
                catch (e) {
                    this.lastDebug.attempts.push({ method: 'GET', path: p, error: e?.response ? String(e.response.status) : e?.message });
                    lastErr = e;
                }
            }
            // If still not found, try a query finder
            if (!data) {
                try {
                    const keyOnly = id.replace(/^TC-?/i, '');
                    const alt = await this.client.post('/testcase/find', {
                        filter: {
                            ...(numericId ? { id: Number(numericId) } : {}),
                            key: id,
                            ...(PROJECT_ID ? { project_id: PROJECT_ID } : {})
                        },
                        omitLargeValues: false
                    });
                    this.lastDebug.attempts.push({ method: 'POST', path: '/testcase/find', status: alt.status });
                    const items = Array.isArray(alt.data?.items) ? alt.data.items : [];
                    data = items[0];
                    // Try with stripped numeric key if not found
                    if (!data && keyOnly !== id) {
                        const alt2 = await this.client.post('/testcase/find', {
                            filter: {
                                ...(numericId ? { id: Number(numericId) } : {}),
                                key: keyOnly,
                                ...(PROJECT_ID ? { project_id: PROJECT_ID } : {})
                            },
                            omitLargeValues: false
                        });
                        this.lastDebug.attempts.push({ method: 'POST', path: '/testcase/find (stripped)', status: alt2.status });
                        const items2 = Array.isArray(alt2.data?.items) ? alt2.data.items : [];
                        data = items2[0];
                    }
                }
                catch (e) {
                    this.lastDebug.attempts.push({ method: 'POST', path: '/testcase/find', error: e?.response ? String(e.response.status) : e?.message });
                    lastErr = e;
                }
            }
            if (!data) {
                const status = lastErr?.response?.status;
                const detail = lastErr?.response?.data ? JSON.stringify(lastErr.response.data) : lastErr?.message;
                throw new Error(`Failed to resolve test case by id or key. Status ${status}. Detail: ${detail}`);
            }
            this.lastDebug.finalDataKeys = data ? Object.keys(data) : undefined;
            return data;
        }
        catch (err) {
            // Re-throw a clear error for route layer
            const status = err?.response?.status;
            const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message ?? String(err);
            const attempted = ['GET /testcase/:id', 'GET /testcases/:id', 'GET /test-cases/:id', 'POST /testcase/find'];
            const message = status ? `Testiny returned ${status}` : 'Request failed';
            throw new Error(`Failed to fetch test case ${id}: ${message}. Detail: ${detail}. Base: ${TESTINY_API}. Attempted: ${attempted.join(', ')}`);
        }
    }
    async getTestCase(id) {
        const data = await this.getTestCaseRaw(id);
        const labels = Array.isArray(data.labels) ? data.labels : [];
        const { steps, expectedFromSteps, discoveryPath, sampleStep, preconditions } = this.extractStepsAndExpected(data);
        if (discoveryPath)
            this.lastDebug.stepDiscoveryPath = discoveryPath;
        if (sampleStep)
            this.lastDebug.sampleStepText = sampleStep;
        const expected = data.expectedResult ||
            data.expected ||
            (expectedFromSteps.length > 0 ? expectedFromSteps.join('\n') : 'No expected result');
        return {
            id: String(data.id ?? id),
            title: data.title || `Test Case ${id}`,
            steps: steps.length > 0 ? steps : ['No steps defined'],
            expectedResult: expected,
            labels,
            expectedPerStep: expectedFromSteps.length > 0 ? expectedFromSteps : undefined,
            preconditions: preconditions && preconditions.length > 0 ? preconditions : undefined
        };
    }
    // Heuristic extractor for a variety of Testiny payload shapes
    extractStepsAndExpected(payload) {
        const stepTexts = [];
        const expectedLines = [];
        const preconditions = [];
        let foundPath;
        // Attempt to parse known JSON-rich text fields (Slate-like structure from Testiny)
        const slateCandidates = [
            { key: 'content_text', value: payload?.content_text },
            { key: 'steps_text', value: payload?.steps_text },
            { key: 'expected_result_text', value: payload?.expected_result_text },
            { key: 'precondition_text', value: payload?.precondition_text },
        ];
        const safeParseJson = (str) => {
            if (typeof str !== 'string' || str.trim() === '')
                return undefined;
            try {
                return JSON.parse(str);
            }
            catch {
                return undefined;
            }
        };
        const collectTextFromSlateNode = (node) => {
            if (!node)
                return '';
            if (typeof node === 'string')
                return node;
            if (Array.isArray(node))
                return node.map(collectTextFromSlateNode).join(' ').trim();
            if (typeof node === 'object') {
                const textLeaf = typeof node.text === 'string' ? node.text : '';
                const childrenText = Array.isArray(node.children)
                    ? node.children.map(collectTextFromSlateNode).join(' ')
                    : '';
                return [textLeaf, childrenText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            }
            return '';
        };
        const parseSlateForStepsExpected = (root) => {
            // Expect a structure with table rows: first column = step, second = expected
            if (!root || typeof root !== 'object')
                return false;
            const children = Array.isArray(root.c) ? root.c : Array.isArray(root.children) ? root.children : [];
            if (!Array.isArray(children) || children.length === 0)
                return false;
            const rows = [];
            const walkSlate = (n) => {
                if (!n || typeof n !== 'object')
                    return;
                if (n.t === 'tr')
                    rows.push(n);
                const kids = Array.isArray(n.c) ? n.c : Array.isArray(n.children) ? n.children : [];
                kids.forEach(walkSlate);
            };
            children.forEach(walkSlate);
            if (rows.length === 0)
                return false;
            let used = false;
            for (const row of rows) {
                const cells = (Array.isArray(row.c) ? row.c : Array.isArray(row.children) ? row.children : []).filter((n) => n && (n.t === 'td' || n.t === 'th'));
                if (cells.length >= 1) {
                    const stepCell = cells[0];
                    const stepText = collectTextFromSlateNode(stepCell);
                    if (stepText) {
                        stepTexts.push(stepText);
                        used = true;
                    }
                }
                if (cells.length >= 2) {
                    const expCell = cells[1];
                    const expText = collectTextFromSlateNode(expCell);
                    if (expText)
                        expectedLines.push(`Expected: ${expText}`);
                }
            }
            return used;
        };
        for (const { key, value } of slateCandidates) {
            const parsed = safeParseJson(value);
            if (parsed) {
                const used = parseSlateForStepsExpected(parsed);
                if (used && !foundPath)
                    foundPath = `${key}:slate-table`;
            }
        }
        const normalizeText = (value) => {
            if (value == null)
                return undefined;
            if (typeof value === 'string') {
                // Strip very basic HTML if present
                const stripped = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (stripped)
                    return stripped;
            }
            if (typeof value === 'number' || typeof value === 'boolean')
                return String(value);
            if (typeof value === 'object') {
                // Common nested fields that hold text
                const maybe = value.text ||
                    value.name ||
                    value.description ||
                    value.content ||
                    value.value;
                if (typeof maybe === 'string')
                    return normalizeText(maybe);
            }
            return undefined;
        };
        const pushFromStepObject = (obj) => {
            const text = normalizeText(obj?.action) ||
                normalizeText(obj?.text) ||
                normalizeText(obj?.description) ||
                normalizeText(obj?.name) ||
                normalizeText(obj?.content) ||
                normalizeText(obj?.step) ||
                // Last resort stringify
                (typeof obj === 'string' ? obj : undefined);
            const expected = normalizeText(obj?.expectedResult) || normalizeText(obj?.expected);
            if (text)
                stepTexts.push(text);
            if (expected)
                expectedLines.push(`Expected: ${expected}`);
        };
        const isStepArray = (arr) => {
            if (!Array.isArray(arr) || arr.length === 0)
                return false;
            const sample = arr[0];
            if (typeof sample === 'string')
                return true;
            if (typeof sample !== 'object')
                return false;
            const keys = new Set(Object.keys(sample));
            const stepLikeKeys = ['action', 'text', 'description', 'name', 'content', 'step'];
            return stepLikeKeys.some((k) => keys.has(k));
        };
        const containersToCheck = [
            'steps',
            'testSteps',
            'sections',
            'content',
            'version',
            'latestVersion',
            'testCaseVersion',
            'fields',
            'data',
        ];
        const visited = new Set();
        const walk = (node, path = []) => {
            if (!node || typeof node !== 'object')
                return;
            if (visited.has(node))
                return;
            visited.add(node);
            // Direct arrays that look like steps
            if (Array.isArray(node) && isStepArray(node)) {
                node.forEach(pushFromStepObject);
                if (!foundPath)
                    foundPath = path.join('.') || '(root-array)';
                return;
            }
            // Objects: probe well-known fields first for performance
            for (const key of Object.keys(node)) {
                const value = node[key];
                // If this key is a likely container of steps
                if (containersToCheck.includes(key)) {
                    if (Array.isArray(value)) {
                        // sections may wrap steps inside nested children
                        if (key === 'sections') {
                            for (const section of value) {
                                if (Array.isArray(section?.steps)) {
                                    if (isStepArray(section.steps)) {
                                        section.steps.forEach(pushFromStepObject);
                                        if (!foundPath)
                                            foundPath = [...path, key, 'steps'].join('.');
                                    }
                                }
                                if (Array.isArray(section?.children)) {
                                    for (const child of section.children) {
                                        if (Array.isArray(child?.steps) && isStepArray(child.steps)) {
                                            child.steps.forEach(pushFromStepObject);
                                            if (!foundPath)
                                                foundPath = [...path, key, 'children', 'steps'].join('.');
                                        }
                                    }
                                }
                            }
                        }
                        // Direct array of steps or step-like objects
                        if (isStepArray(value)) {
                            value.forEach(pushFromStepObject);
                            if (!foundPath)
                                foundPath = [...path, key].join('.');
                        }
                    }
                    else if (value && typeof value === 'object') {
                        // Nested container, keep walking
                        walk(value, [...path, key]);
                    }
                }
            }
            // Fallback: generic deep walk
            for (const [k, v] of Object.entries(node)) {
                if (Array.isArray(v) && isStepArray(v)) {
                    v.forEach(pushFromStepObject);
                    if (!foundPath)
                        foundPath = [...path, k].join('.');
                }
                else if (v && typeof v === 'object') {
                    walk(v, [...path, k]);
                }
            }
        };
        walk(payload);
        // Collect preconditions from common fields
        const pushPreconditions = (val) => {
            const n = normalizeText(val);
            if (!n)
                return;
            // split by lines/bullets
            const items = n
                .split(/\r?\n|\u2022|\-|\*+/g)
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
                .slice(0, 50);
            preconditions.push(...items);
        };
        if (payload?.preconditions)
            pushPreconditions(payload.preconditions);
        if (payload?.precondition)
            pushPreconditions(payload.precondition);
        if (payload?.precondition_text) {
            const parsed = safeParseJson(payload.precondition_text);
            if (parsed) {
                const text = collectTextFromSlateNode(parsed);
                pushPreconditions(text);
            }
            else {
                pushPreconditions(payload.precondition_text);
            }
        }
        // Final fallback: try splitting long description/content into steps
        if (stepTexts.length === 0) {
            const longTextCandidate = payload?.procedure || payload?.howto || payload?.description || payload?.content || payload?.text;
            const normalized = normalizeText(longTextCandidate);
            if (normalized) {
                const lines = normalized
                    .split(/\r?\n|\u2022|\-/g)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0)
                    .slice(0, 50);
                stepTexts.push(...lines);
                if (!foundPath)
                    foundPath = 'fallback:description-split';
            }
        }
        return {
            steps: stepTexts,
            expectedFromSteps: expectedLines,
            discoveryPath: foundPath,
            sampleStep: stepTexts[0],
            preconditions,
        };
    }
}
exports.TestinyService = TestinyService;
