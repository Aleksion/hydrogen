import type {CacheOptions, QueryKey} from '../../types';
import {
  deleteItemFromCache,
  getItemFromCache,
  isStale,
  setItemInCache,
  hashKey,
} from '../../framework/cache';
import {runDelayedFunction} from '../../framework/runtime';
import {SuspensePromise} from './SuspensePromise';

const suspensePromises: Map<string, SuspensePromise<unknown>> = new Map();

export interface HydrogenUseQueryOptions {
  cache: CacheOptions;
}

/**
 * The `useQuery` hook is a wrapper around global runtime's Cache API.
 * It supports Suspense calls on the server and on the client.
 */
export function useQuery<T>(
  /** A string or array to uniquely identify the current query. */
  key: QueryKey,
  /** An asynchronous query function like `fetch` which returns data. */
  queryFn: () => Promise<T>,
  /** Options including `cache` to manage the cache behavior of the sub-request. */
  queryOptions?: HydrogenUseQueryOptions
): T {
  console.log(`Loading ${findQueryname(key)} query`);
  const cacheKey = hashKey(key);
  const suspensePromise = getSuspensePromise<T>(key, queryFn, queryOptions);
  const status = suspensePromise.status;

  if (status === SuspensePromise.PENDING) {
    throw suspensePromise.promise;
  } else if (status === SuspensePromise.ERROR) {
    throw suspensePromise.result;
  } else if (status === SuspensePromise.SUCCESS) {
    suspensePromises.delete(cacheKey);
    logg(`${findQueryname(key)} query took ${suspensePromise.queryDuration}ms`);
    return suspensePromise.result as T;
  }

  throw 'useQuery - something is really wrong if this throws';
}

/**
 * Preloads the query with suspense support
 */
export function preloadQuery<T>(
  /** A string or array to uniquely identify the current query. */
  key: QueryKey,
  /** An asynchronous query function like `fetch` which returns data. */
  queryFn: () => Promise<T>,
  /** Options including `cache` to manage the cache behavior of the sub-request. */
  queryOptions?: HydrogenUseQueryOptions
): void {
  console.log(`Preloading ${findQueryname(key)} query`);
  getSuspensePromise<T>(key, queryFn, queryOptions);
}

function findQueryname(key: QueryKey) {
  const match = (typeof key === 'string' ? key : key.join()).match(
    /query ([^\s\()]*)\s?(|\(\{)/
  );
  if (match && match.length > 1) {
    return match[1];
  }
  return '<unknown>';
}

function log(...text: any[]) {
  console.log('\x1b[33m%s\x1b[0m', ...text);
}

function logg(...text: any[]) {
  console.log('\x1b[32m%s\x1b[0m', ...text);
}

function getSuspensePromise<T>(
  key: QueryKey,
  queryFn: () => Promise<T>,
  queryOptions?: HydrogenUseQueryOptions
): SuspensePromise<T> {
  const cacheKey = hashKey(key);
  let suspensePromise = suspensePromises.get(cacheKey);
  if (!suspensePromise) {
    suspensePromise = new SuspensePromise<T>(
      cachedQueryFnBuilder(key, queryFn, queryOptions)
    );
    suspensePromises.set(cacheKey, suspensePromise);
    console.log(`${findQueryname(key)} SuspensePromise created`);
  }
  return suspensePromise as SuspensePromise<T>;
}

function cachedQueryFnBuilder<T>(
  key: QueryKey,
  queryFn: () => Promise<T>,
  queryOptions?: HydrogenUseQueryOptions
) {
  const resolvedQueryOptions = {
    /**
     * Prevent react-query from from retrying request failures. This sometimes bites developers
     * because they will get back a 200 GraphQL response with errors, but not properly check
     * for errors. This leads to a failed `queryFn` and react-query keeps running it, leading
     * to a much slower response time and a poor developer experience.
     */
    retry: false,
    ...(queryOptions ?? {}),
  };

  /**
   * Attempt to read the query from cache. If it doesn't exist or if it's stale, regenerate it.
   */
  async function cachedQueryFn() {
    const cacheResponse = await getItemFromCache(key);

    async function generateNewOutput() {
      return await queryFn();
    }

    log('cachedQueryFn', cacheResponse);

    if (cacheResponse) {
      const [output, response] = cacheResponse;

      /**
       * Important: Do this async
       */
      if (isStale(response)) {
        console.log(
          '[useQuery] cache stale; generating new response in background'
        );
        const lockKey = `lock-${key}`;

        runDelayedFunction(async () => {
          console.log(`[stale regen] fetching cache lock`);
          const lockExists = await getItemFromCache(lockKey);
          if (lockExists) return;

          await setItemInCache(lockKey, true);
          try {
            const output = await generateNewOutput();
            await setItemInCache(key, output, resolvedQueryOptions?.cache);
          } catch (e: any) {
            console.error(`Error generating async response: ${e.message}`);
          } finally {
            await deleteItemFromCache(lockKey);
          }
        });
      }

      return output;
    }

    const newOutput = await generateNewOutput();

    /**
     * Important: Do this async
     */
    runDelayedFunction(
      async () =>
        await setItemInCache(key, newOutput, resolvedQueryOptions?.cache)
    );

    return newOutput;
  }

  return cachedQueryFn;
}
