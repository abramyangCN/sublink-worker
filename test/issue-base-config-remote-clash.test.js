import { afterEach, describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { encodeBase64 } from '../src/utils.js';

const remoteSubscriptionUrl = 'https://example.com/subscription';
const remoteNodes = [
    'anytls://pass-1@example.com:443/?insecure=1&sni=cdn.example.com#HK-01',
    'anytls://pass-2@example.com:444/?insecure=1&sni=cdn.example.com#US-01'
].join('\n');

const clashBaseConfig = `
rules:
  - DOMAIN-SUFFIX,ayxay.com,DIRECT
  - DOMAIN-SUFFIX,abramyang.com,DIRECT
  - RULE-SET,category-ai-!cn,💬 AI Services
  - RULE-SET,google-ip,🔍 Google Services,no-resolve
  - MATCH,🐟 Fall Back
proxy-groups:
  - type: select
    name: 🚀 Node Select
    proxies:
      - DIRECT
      - REJECT
  - type: select
    name: 💬 AI Services
    proxies:
      - 🚀 Node Select
      - DIRECT
      - REJECT
  - type: select
    name: 🐟 Fall Back
    proxies:
      - 🚀 Node Select
      - DIRECT
      - REJECT
rule-providers:
  category-ai-!cn:
    type: http
    format: yaml
    behavior: domain
    url: https://example.com/category-ai.yaml
    path: ./ruleset/category-ai.yaml
    interval: 86400
  google-ip:
    type: http
    format: yaml
    behavior: ipcidr
    url: https://example.com/google-ip.yaml
    path: ./ruleset/google-ip.yaml
    interval: 86400
`;

function createTestApp() {
    return createApp({
        kv: new MemoryKVAdapter(),
        assetFetcher: null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null
        }
    });
}

describe('Base config + remote Clash conversion', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('preserves saved Clash base config rules and providers when converting a remote subscription', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url === remoteSubscriptionUrl) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => encodeBase64(remoteNodes),
                    headers: {
                        get: () => null
                    }
                };
            }

            throw new Error(`Unexpected fetch URL: ${url}`);
        }));

        const app = createTestApp();

        const saveRes = await app.request('http://localhost/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'clash',
                content: clashBaseConfig
            })
        });

        expect(saveRes.status).toBe(200);
        const configId = (await saveRes.text()).trim();
        expect(configId).toBeTruthy();

        const res = await app.request(
            `http://localhost/clash?config=${encodeURIComponent(remoteSubscriptionUrl)}&configId=${encodeURIComponent(configId)}&lang=en-US`
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('x-sublink-config-id')).toBe(configId);
        expect(res.headers.get('x-sublink-base-config-loaded')).toBe('true');
        expect(res.headers.get('x-sublink-base-config-rules')).toBe('5');
        expect(res.headers.get('x-sublink-base-config-proxy-groups')).toBe('3');
        expect(res.headers.get('x-sublink-base-config-rule-providers')).toBe('2');
        expect(res.headers.get('x-sublink-output-proxies')).toBe('2');
        const built = yaml.load(await res.text());

        expect((built.proxies || []).map(proxy => proxy.name)).toEqual(expect.arrayContaining(['HK-01', 'US-01']));
        expect(built.rules).toEqual(expect.arrayContaining([
            'DOMAIN-SUFFIX,ayxay.com,DIRECT',
            'DOMAIN-SUFFIX,abramyang.com,DIRECT',
            'RULE-SET,category-ai-!cn,💬 AI Services',
            'RULE-SET,google-ip,🔍 Google Services,no-resolve'
        ]));
        expect(built['rule-providers']?.['category-ai-!cn']).toBeDefined();
        expect(built['rule-providers']?.['google-ip']).toBeDefined();
        expect((built['proxy-groups'] || []).some(group => group?.name === '💬 AI Services')).toBe(true);
        expect((built['proxy-groups'] || []).some(group => group?.name === '🐟 Fall Back')).toBe(true);
    });
});
