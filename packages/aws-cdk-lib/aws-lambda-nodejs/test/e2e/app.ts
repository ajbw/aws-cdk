#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * Generic CDK app for e2e bundling tests.
 *
 * Reads configuration from the E2E_CONFIG environment variable (JSON).
 * Instantiates a NodejsFunction with the given settings and synthesizes.
 */
import * as path from 'path';
import { RuntimeKey, SerializableNodejsFunctionProps } from './types';
import { ICommandHooks } from '../../lib/types';

const CDK_LIB = process.env.CDK_LIB_PATH;
if (!CDK_LIB) {
  throw new Error('CDK_LIB_PATH environment variable must be set');
}

// Minimal imports to avoid loading too many files (during tests the CDK codebase hasn't been lazified yet)
type AwsLambdaNodeJs = typeof import('aws-cdk-lib/aws-lambda-nodejs');
const { App, Stack } = require(`${CDK_LIB}/core`) as typeof import('aws-cdk-lib');
const { NodejsFunction } = require(`${CDK_LIB}/aws-lambda-nodejs`) as AwsLambdaNodeJs;
const { Runtime } = require(`${CDK_LIB}/aws-lambda`) as typeof import('aws-cdk-lib/aws-lambda');

const config: SerializableNodejsFunctionProps = JSON.parse(process.env.E2E_CONFIG || '{}');

const app = new App();
const stack = new Stack(app, 'TestStack');

const runtimeName: RuntimeKey = config.runtime ?? 'NODEJS_20_X';
const runtime = Runtime[runtimeName];

let commandHooks: ICommandHooks | undefined;
if (config.bundling.commandHooks) {
  const hooks = config.bundling.commandHooks;
  const sub = (cmds: string[], inputDir: string, outputDir: string) =>
    (cmds || []).map((c: string) => c.replace(/\{inputDir\}/g, inputDir).replace(/\{outputDir\}/g, outputDir));
  commandHooks = {
    beforeBundling: (inputDir: string, outputDir: string) => sub(hooks.beforeBundling, inputDir, outputDir),
    beforeInstall: (inputDir: string, outputDir: string) => sub(hooks.beforeInstall, inputDir, outputDir),
    afterBundling: (inputDir: string, outputDir: string) => sub(hooks.afterBundling, inputDir, outputDir),
  };
}

// Reconstruct commandHooks from serializable config.
// Hook commands can use {inputDir} and {outputDir} placeholders.
const bundlingConfig = {
  ...config.bundling,
  commandHooks,
};

new NodejsFunction(stack, 'Fn', {
  // Normally these paths are resolved w.r.t. this file, but we want to resolve them w.r.t. the working directory, so make them absolute.
  entry: path.resolve(config.entry),
  workspaceRoot: config.workspaceRoot ? path.resolve(config.workspaceRoot) : undefined,
  projectRoot: config.projectRoot ? path.resolve(config.projectRoot) : undefined,
  depsLockFilePath: config.depsLockFilePath ? path.resolve(config.depsLockFilePath) : undefined,
  runtime,
  bundling: bundlingConfig,
});

app.synth();
