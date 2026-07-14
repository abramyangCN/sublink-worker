import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

function createFormData(fakeWindow) {
  const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
  const result = fn(fakeWindow);
  return result.formData();
}

describe('formLogic toString fix', () => {
  it('includes parseSurgeConfigInput definition in toString output', () => {
    const fnString = formLogicFn.toString();

    // Verify the function references parseSurgeConfigInput
    expect(fnString).toContain('parseSurgeConfigInput');

    // Verify the arrow function definitions ARE included
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeConfigInput\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeValue\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+convertSurgeIniToJson\s*=/);
  });

  it('does not contain __name calls that break in browser runtime', () => {
    const fnString = formLogicFn.toString();
    // Ensure no function declarations that esbuild would inject __name() for
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeValue\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+convertSurgeIniToJson\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeConfigInput\b/m);
  });

  it('formData() returns a valid Alpine data object', () => {
    // Simulate browser global environment using Function constructor
    const fakeWindow = { APP_TRANSLATIONS: {}, PREDEFINED_RULE_SETS: {} };
    const data = createFormData(fakeWindow);
    expect(typeof data.submitForm).toBe('function');
    expect(typeof data.toggleAccordion).toBe('function');
    expect(data.showAdvanced).toBe(false);
  });

  it('buildGeneratedLinks includes configId in clash link when present', () => {
    const fakeWindow = {
      APP_TRANSLATIONS: {},
      PREDEFINED_RULE_SETS: {},
      location: {
        origin: 'https://example.com',
        search: '?configId=cfg_123'
      }
    };
    const data = createFormData(fakeWindow);

    data.input = 'ss://YWVzLTI1Ni1nY206dGVzdA==@example.com:8388#node';
    const links = data.buildGeneratedLinks([]);

    expect(links.clash).toContain('/clash?');
    expect(links.clash).toContain('configId=cfg_123');
  });

  it('refreshGeneratedLinks rebuilds stale links after configId changes', () => {
    const fakeWindow = {
      APP_TRANSLATIONS: {},
      PREDEFINED_RULE_SETS: {},
      location: {
        origin: 'https://example.com',
        search: ''
      }
    };
    const originalDocument = globalThis.document;
    globalThis.document = {
      querySelector: () => null
    };

    try {
      const data = createFormData(fakeWindow);
      data.input = 'ss://YWVzLTI1Ni1nY206dGVzdA==@example.com:8388#node';
      data.generatedLinks = data.buildGeneratedLinks([]);
      data.shortenedLinks = { clash: 'https://example.com/c/old' };

      data.currentConfigId = 'cfg_456';
      data.refreshGeneratedLinks();

      expect(data.generatedLinks.clash).toContain('configId=cfg_456');
      expect(data.shortenedLinks).toBeNull();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
