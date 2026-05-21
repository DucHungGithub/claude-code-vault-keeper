/**
 * TDD tests for the reusable GitHub Action (action.yml)
 *
 * RED: fails until action.yml exists with correct structure.
 *
 * Tests verify the action.yml contract without running actual GitHub Actions:
 * - Required fields: name, description, runs
 * - Input declarations match what the CLI accepts
 * - The composite action invokes vault-keeper correctly
 */

import { test, expect, describe } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTION_PATH = resolve(REPO, 'action.yml');

describe('GitHub Action (action.yml)', () => {
  test('action.yml exists at repo root', () => {
    expect(existsSync(ACTION_PATH)).toBe(true);
  });

  test('action.yml is valid YAML', () => {
    const content = readFileSync(ACTION_PATH, 'utf-8');
    expect(() => parseYaml(content)).not.toThrow();
  });

  test('action has required top-level fields: name, description, runs', () => {
    const action = parseYaml(readFileSync(ACTION_PATH, 'utf-8'));
    expect(typeof action.name).toBe('string');
    expect(action.name.length).toBeGreaterThan(0);
    expect(typeof action.description).toBe('string');
    expect(action.description.length).toBeGreaterThan(0);
    expect(typeof action.runs).toBe('object');
  });

  test('action uses composite runner', () => {
    const action = parseYaml(readFileSync(ACTION_PATH, 'utf-8'));
    expect(action.runs.using).toBe('composite');
    expect(Array.isArray(action.runs.steps)).toBe(true);
    expect(action.runs.steps.length).toBeGreaterThan(0);
  });

  test('action declares a "root" input for vault path', () => {
    const action = parseYaml(readFileSync(ACTION_PATH, 'utf-8'));
    expect(action.inputs).toBeDefined();
    expect(action.inputs.root).toBeDefined();
    expect(typeof action.inputs.root.description).toBe('string');
  });

  test('action declares a "strict" input (boolean flag)', () => {
    const action = parseYaml(readFileSync(ACTION_PATH, 'utf-8'));
    expect(action.inputs.strict).toBeDefined();
  });

  test('action steps include vault-keeper validate invocation', () => {
    const action = parseYaml(readFileSync(ACTION_PATH, 'utf-8'));
    const steps = action.runs.steps;
    // At least one step must run vault-keeper validate
    const hasValidate = steps.some((s) => {
      const run = s.run || '';
      return run.includes('vault-keeper') || run.includes('validate-documents') || run.includes('npx');
    });
    expect(hasValidate).toBe(true);
  });

  test('action has branding (icon + color) for marketplace visibility', () => {
    const action = parseYaml(readFileSync(ACTION_PATH, 'utf-8'));
    expect(action.branding).toBeDefined();
    expect(typeof action.branding.icon).toBe('string');
    expect(typeof action.branding.color).toBe('string');
  });
});
