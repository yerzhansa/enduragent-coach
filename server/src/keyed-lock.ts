export type KeyedLock<K> = <T>(key: K, task: () => Promise<T>) => Promise<T>;

export function keyedLock<K>(): KeyedLock<K> {
  const tails = new Map<K, Promise<unknown>>();
  return async (key, task) => {
    const run = (tails.get(key) ?? Promise.resolve()).then(task);
    const tail = Promise.allSettled([run]);
    tails.set(key, tail);
    try {
      return await run;
    } finally {
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}
