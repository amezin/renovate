import { DateTime, Settings } from 'luxon';
import { mockDeep } from 'vitest-mock-extended';
import { Http } from '..';
import { GlobalConfig } from '../../../config/global';
import * as _packageCache from '../../cache/package';
import { PackageHttpCacheProvider } from './package-http-cache-provider';
import type { HttpCache } from './schema';
import * as httpMock from '~test/http-mock';

vi.mock('../../../util/cache/package', () => mockDeep());
const packageCache = vi.mocked(_packageCache);

const http = new Http('test');

describe('util/http/cache/package-http-cache-provider', () => {
  const url = 'http://example.com/foo/bar';

  let cache: Record<string, HttpCache> = {};

  beforeEach(() => {
    vi.resetAllMocks();
    cache = {};

    packageCache.get.mockImplementation((_ns, k) => {
      const res = cache[k] as never;
      return Promise.resolve(res);
    });

    packageCache.set.mockImplementation((_ns, k, v, _ttl) => {
      cache[k] = v as HttpCache;
      return Promise.resolve(null as never);
    });

    GlobalConfig.reset();
  });

  const mockTime = (time: string) => {
    const value = DateTime.fromISO(time).valueOf();
    Settings.now = () => value;
  };

  it('loads cache correctly', async () => {
    mockTime('2024-06-15T00:00:00.000Z');

    cache[url] = {
      etag: 'etag-value',
      lastModified: 'Fri, 15 Jun 2024 00:00:00 GMT',
      httpResponse: { statusCode: 200, body: 'old response' },
      timestamp: '2024-06-15T00:00:00.000Z',
    };
    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
      ttlMinutes: 0,
    });
    httpMock.scope(url).get('').reply(200, 'new response');

    const res = await http.getText(url, { cacheProvider });

    expect(res.body).toBe('new response');
  });

  it('loads cache bypassing server', async () => {
    mockTime('2024-06-15T00:14:59.999Z');
    cache[url] = {
      etag: 'etag-value',
      lastModified: 'Fri, 15 Jun 2024 00:00:00 GMT',
      httpResponse: { statusCode: 200, body: 'cached response' },
      timestamp: '2024-06-15T00:00:00.000Z',
    };
    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
    });

    const res = await http.getText(url, { cacheProvider });

    expect(res.body).toBe('cached response');
    expect(packageCache.set).not.toHaveBeenCalled();

    mockTime('2024-06-15T00:15:00.000Z');
    httpMock.scope(url).get('').reply(200, 'new response', {
      etag: 'foobar',
      'cache-control': 'max-age=180, public',
    });

    const res2 = await http.getText(url, { cacheProvider });
    expect(res2.body).toBe('new response');
    expect(packageCache.set).toHaveBeenCalled();
  });

  it('handles cache miss', async () => {
    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
    });
    httpMock.scope(url).get('').reply(200, 'fetched response', {
      etag: 'foobar',
      'cache-control': 'max-age=180, public',
    });

    const res = await http.getText(url, { cacheProvider });

    expect(res.body).toBe('fetched response');
    expect(cache).toEqual({
      'http://example.com/foo/bar': {
        etag: 'foobar',
        httpResponse: {
          statusCode: 200,
          headers: expect.any(Object),
          body: 'fetched response',
        },
        lastModified: undefined,
        timestamp: expect.any(String),
      },
    });
  });

  it('prevents caching when cache-control is private', async () => {
    mockTime('2024-06-15T00:00:00.000Z');

    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
    });

    httpMock.scope(url).get('').reply(200, 'private response', {
      'cache-control': 'max-age=180, private',
    });

    const res = await http.get(url, { cacheProvider });

    expect(res.body).toBe('private response');
    expect(packageCache.set).not.toHaveBeenCalled();
  });

  it('allows caching when cache-control is private but cachePrivatePackages=true', async () => {
    GlobalConfig.set({ cachePrivatePackages: true });

    mockTime('2024-06-15T00:00:00.000Z');

    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
      checkCacheControl: false,
    });

    httpMock.scope(url).get('').reply(200, 'private response', {
      etag: 'foobar',
      'cache-control': 'max-age=180, private',
    });

    const res = await http.get(url, { cacheProvider });

    expect(res.body).toBe('private response');
    expect(packageCache.set).toHaveBeenCalled();
  });

  it('allows caching when cache-control is private but checkCacheControl=false', async () => {
    mockTime('2024-06-15T00:00:00.000Z');

    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
      checkCacheControl: false,
    });

    httpMock.scope(url).get('').reply(200, 'private response', {
      etag: 'foobar',
      'cache-control': 'max-age=180, private',
    });

    const res = await http.get(url, { cacheProvider });

    expect(res.body).toBe('private response');
    expect(packageCache.set).toHaveBeenCalled();
  });

  it('serves stale response during revalidation error', async () => {
    mockTime('2024-06-15T00:15:00.000Z');
    cache[url] = {
      etag: 'etag-value',
      lastModified: 'Fri, 15 Jun 2024 00:00:00 GMT',
      httpResponse: { statusCode: 200, body: 'cached response' },
      timestamp: '2024-06-15T00:00:00.000Z',
    };
    const cacheProvider = new PackageHttpCacheProvider({
      namespace: '_test-namespace',
    });
    httpMock.scope(url).get('').reply(500);

    const res = await http.getText(url, { cacheProvider });

    expect(res.body).toBe('cached response');
  });
});
