"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnerService = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
class RunnerService {
    constructor(outputDir = path_1.default.resolve(process.cwd(), 'output', 'generated')) {
        this.outputRoot = outputDir;
    }
    async saveGeneratedTest(params) {
        const { code, testCaseId, target } = params;
        const safeTarget = target.replace(/[^a-zA-Z0-9_-]/g, '-');
        const dir = path_1.default.join(this.outputRoot, safeTarget);
        const isPython = /pytest|python/.test(safeTarget);
        let fileName;
        if (isPython) {
            const safeId = String(testCaseId).replace(/[^A-Za-z0-9_]/g, '_');
            const safeTargetForPy = safeTarget.replace(/[^A-Za-z0-9_]/g, '_');
            const moduleBase = `test_TC_${safeId}_${safeTargetForPy}`;
            fileName = `${moduleBase}.py`;
        }
        else {
            fileName = `TC-${testCaseId}.${safeTarget}.spec.ts`;
        }
        const filePath = path_1.default.join(dir, fileName);
        await fs_1.promises.mkdir(dir, { recursive: true });
        await fs_1.promises.writeFile(filePath, code, 'utf8');
        return filePath;
    }
    // Placeholder for future execution (Appium/Pytest/etc.)
    async runSavedTest(filePath) {
        const isAppiumJs = /appium-js/.test(filePath);
        const isPytest = /pytest-appium-ios/.test(filePath) || /\.py$/.test(filePath);
        let cmd;
        if (isAppiumJs) {
            const hasWdio = await this.checkWdioInstalled();
            const ext = path_1.default.extname(filePath);
            if (ext === '.ts') {
                cmd = `npx --yes ts-node "${filePath}"`;
            }
            else {
                cmd = `node "${filePath}"`;
            }
            if (!hasWdio) {
                return {
                    status: 'missing-deps',
                    message: 'Appium/WebdriverIO likely missing. Install: npm i -D webdriverio appium appium-doctor ts-node typescript'
                };
            }
        }
        else if (isPytest) {
            // Run pytest via poetry if available, else system pytest
            const hasPoetry = await this.checkPoetryInstalled();
            const pythonCmd = hasPoetry ? `poetry run pytest -q "${filePath}"` : `pytest -q "${filePath}"`;
            cmd = pythonCmd;
        }
        else {
            return { status: 'error', message: 'Unknown test type. Cannot determine runner.' };
        }
        return new Promise((resolve) => {
            (0, child_process_1.exec)(cmd, { cwd: process.cwd(), env: process.env, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    resolve({ status: 'error', message: error.message, stdout, stderr });
                    return;
                }
                resolve({ status: 'ok', exitCode: 0, stdout, stderr });
            });
        });
    }
    async checkWdioInstalled() {
        try {
            const pkgPath = require.resolve('webdriverio/package.json', { paths: [process.cwd()] });
            return Boolean(pkgPath);
        }
        catch {
            return false;
        }
    }
    async checkPoetryInstalled() {
        return new Promise((resolve) => {
            (0, child_process_1.exec)('poetry --version', (err) => resolve(!err));
        });
    }
}
exports.RunnerService = RunnerService;
