import { describe, test, expect } from 'bun:test';
import { explainError } from '../lib/error-explainer.js';

describe('lib/error-explainer.js', () => {
  test('explains missing required field', () => {
    const result = explainError({
      field: 'status',
      message: 'Missing required field: status',
      error_type: 'required',
    });
    expect(result.title).toBeTruthy();
    expect(result.description).toBeTruthy();
    expect(result.fix).toBeTruthy();
    expect(typeof result.fix).toBe('string');
  });

  test('explains enum violation with allowed values', () => {
    const result = explainError({
      field: 'status',
      message: 'enum violation',
      error_type: 'enum',
      allowed: ['draft', 'review', 'approved'],
    });
    expect(result.title).toBeTruthy();
    expect(result.fix).toContain('draft');
  });

  test('explains pattern mismatch', () => {
    const result = explainError({
      field: '$path',
      message: 'pattern: does not match',
      error_type: 'pattern',
      pattern: '^docs/.*\\.md$',
    });
    expect(result.title).toBeTruthy();
    expect(result.fix).toBeTruthy();
  });

  test('explains type mismatch', () => {
    const result = explainError({
      field: 'priority',
      message: 'type: expected integer',
      error_type: 'type',
    });
    expect(result.title).toBeTruthy();
    expect(result.fix).toBeTruthy();
  });

  test('falls back gracefully for unknown error type', () => {
    const result = explainError({ field: 'foo', message: 'something went wrong' });
    expect(result.title).toBeTruthy();
    expect(result.description).toBeTruthy();
    expect(result.fix).toBeTruthy();
  });

  test('returns plain strings not HTML', () => {
    const result = explainError({ field: 'title', message: 'Missing required field: title', error_type: 'required' });
    expect(result.title).not.toContain('<');
    expect(result.fix).not.toContain('<');
  });
});
