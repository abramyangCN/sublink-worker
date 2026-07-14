import { afterEach, describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { encodeBase64 } from '../src/utils.js';

const remoteSubscriptionUrl = 'https://example.com/ua-dependent-sub';
const remoteNode = 'ss://YWVzLTEyOC1nY206cGFzcw@example.com:443#FallbackNode';

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

describe('Remote subscription UA fallback', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('retries remote subscription fetch without UA when the UA-specific payload yields no nodes', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
            if (url !== remoteSubscriptionUrl) {
                throw new Error(`Unexpected fetch URL: ${url}`);
            }

            const userAgent = init?.headers?.get?.('User-Agent');
            if (userAgent === 'FlClash/v0.8.94') {
                return {
                    ok: true,
                    status: 200,
                    text: async () => 'mode: rule\nlog-level: info\n',
                    headers: {
                        get: () => null
                    }
                };
            }

            return {
                ok: true,
                status: 200,
                text: async () => encodeBase64(remoteNode),
                headers: {
                    get: () => null
                }
            };
        }));

        const app = createTestApp();
        const res = await app.request(
            `http://localhost/clash?config=${encodeURIComponent(remoteSubscriptionUrl)}&ua=${encodeURIComponent('FlClash/v0.8.94')}&group_by_country=true&lang=en-US`
        );

        expect(res.status).toBe(200);
        const built = yaml.load(await res.text());
        expect((built.proxies || []).map(proxy => proxy.name)).toContain('FallbackNode');
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('returns a 502 instead of an empty Clash config when remote subscription fetch yields no supported proxies', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => 'error code: 1003',
            headers: {
                get: () => null
            }
        })));

        const app = createTestApp();
        const res = await app.request(
            `http://localhost/clash?config=${encodeURIComponent(remoteSubscriptionUrl)}&ua=${encodeURIComponent('FlClash/v0.8.94')}&lang=en-US`
        );

        expect(res.status).toBe(502);
        expect(await res.text()).toContain('Remote subscription returned no supported proxies');
    });
});
