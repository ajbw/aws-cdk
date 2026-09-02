import * as fs from 'fs';
import * as path from 'path';
import type { TestProject } from './bundling-e2e-helpers';
import {
  PNPM_LOCK_WITH_DELAY,
  TS_HANDLER_WITH_DELAY,
  assetFiles,
  cdkSynth,
  createProjectMonorepo,
  describeDockerSuite,
  findAssetDir,
} from './bundling-e2e-helpers';

// Increase timeout — Docker bundling can take a while
jest.setTimeout(3_000_000);

let project: TestProject;
afterEach(() => project?.cleanup());

describeDockerSuite((forceDockerBundling) => {
  test('workspaceRoot and projectRoot resolve a project nested inside a monorepo', () => {
    project = createProjectMonorepo('pnpm', '.ts');
    const projectRoot = path.dirname(project.entryFile);

    cdkSynth(project, {
      entry: project.entryFile,
      workspaceRoot: project.dir,
      projectRoot,
      depsLockFilePath: project.lockfile,
      bundling: {
        forceDockerBundling,
      },
    });

    const files = assetFiles(project.outdir);
    expect(files).toContain('index.js');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundled = require(path.join(findAssetDir(project.outdir), 'index.js'));
    expect(typeof bundled.handler).toBe('function');
  });

  test('pnpm workspace catalog dependency installs via nodeModules, and pnpm-workspace.yaml is copied to output', () => {
    project = createProjectMonorepo('pnpm', '.ts');
    const projectRoot = path.dirname(project.entryFile);

    // Handler imports 'delay', which is externalized and installed via nodeModules
    fs.writeFileSync(project.entryFile, TS_HANDLER_WITH_DELAY);

    // Project package.json resolves its 'delay' dependency via the workspace catalog
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      name: 'test-project', version: '1.0.0', dependencies: { delay: 'catalog:' },
    }));

    // A real pnpm lock file that resolves delay@5.0.0 via the workspace catalog
    fs.writeFileSync(project.lockfile, PNPM_LOCK_WITH_DELAY);

    cdkSynth(project, {
      entry: project.entryFile,
      workspaceRoot: project.dir,
      projectRoot,
      depsLockFilePath: project.lockfile,
      bundling: {
        forceDockerBundling,
        nodeModules: ['delay'],
      },
    });

    const files = assetFiles(project.outdir);
    expect(files).toContain('index.js');
    expect(files).toContain('package.json');
    // pnpm-workspace.yaml must be copied to the output so the 'catalog:' dependency can be resolved
    expect(files).toContain('pnpm-workspace.yaml');
    // delay should be installed as a real node_module, not bundled
    expect(files).toEqual(expect.arrayContaining([
      expect.stringMatching(/^node_modules\/delay\//),
    ]));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundled = require(path.join(findAssetDir(project.outdir), 'index.js'));
    expect(typeof bundled.handler).toBe('function');
  });
});
