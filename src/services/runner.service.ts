import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';

export class RunnerService {
  private outputRoot: string;

  constructor(outputDir = path.resolve(process.cwd(), 'output', 'generated')) {
    this.outputRoot = outputDir;
  }

  async saveGeneratedTest(params: {
    code: string;
    testCaseId: string;
    target: string;
  }): Promise<string> {
    const { code, testCaseId, target } = params;
    const safeTarget = target.replace(/[^a-zA-Z0-9_-]/g, '-');
    const dir = path.join(this.outputRoot, safeTarget);
    const isPython = /pytest|python/.test(safeTarget);
    let fileName: string;
    if (isPython) {
      const safeId = String(testCaseId).replace(/[^A-Za-z0-9_]/g, '_');
      const safeTargetForPy = safeTarget.replace(/[^A-Za-z0-9_]/g, '_');
      const moduleBase = `test_TC_${safeId}_${safeTargetForPy}`;
      fileName = `${moduleBase}.py`;
    } else {
      fileName = `TC-${testCaseId}.${safeTarget}.spec.ts`;
    }
    const filePath = path.join(dir, fileName);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, code, 'utf8');

    return filePath;
  }

  // Placeholder for future execution (Appium/Pytest/etc.)
  async runSavedTest(filePath: string): Promise<
    | { status: 'ok'; exitCode: number; stdout: string; stderr: string }
    | { status: 'missing-deps'; message: string }
    | { status: 'error'; message: string; stdout?: string; stderr?: string }
  > {
    const isAppiumJs = /appium-js/.test(filePath);
    const isPytest = /pytest-appium-ios/.test(filePath) || /\.py$/.test(filePath);

    let cmd: string;
    if (isAppiumJs) {
      const hasWdio = await this.checkWdioInstalled();
      const ext = path.extname(filePath);
      if (ext === '.ts') {
        cmd = `npx --yes ts-node "${filePath}"`;
      } else {
        cmd = `node "${filePath}"`;
      }
      if (!hasWdio) {
        return {
          status: 'missing-deps',
          message: 'Appium/WebdriverIO likely missing. Install: npm i -D webdriverio appium appium-doctor ts-node typescript'
        };
      }
    } else if (isPytest) {
      // Run pytest via poetry if available, else system pytest
      const hasPoetry = await this.checkPoetryInstalled();
      const pythonCmd = hasPoetry ? `poetry run pytest -q "${filePath}"` : `pytest -q "${filePath}"`;
      cmd = pythonCmd;
    } else {
      return { status: 'error', message: 'Unknown test type. Cannot determine runner.' };
    }

    return new Promise((resolve) => {
      exec(cmd, { cwd: process.cwd(), env: process.env, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ status: 'error', message: error.message, stdout, stderr });
          return;
        }
        resolve({ status: 'ok', exitCode: 0, stdout, stderr });
      });
    });
  }

  private async checkWdioInstalled(): Promise<boolean> {
    try {
      const pkgPath = require.resolve('webdriverio/package.json', { paths: [process.cwd()] });
      return Boolean(pkgPath);
    } catch {
      return false;
    }
  }

  private async checkPoetryInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('poetry --version', (err) => resolve(!err));
    });
  }
}


