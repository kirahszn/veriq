export async function resolveServerRead<T>(options: { fresh?: boolean }, dependencies: {
  readCached: () => Promise<T>;
  readFresh: () => Promise<T>;
  fallback: (error: unknown) => T;
}): Promise<T> {
  try {
    return await (options.fresh ? dependencies.readFresh() : dependencies.readCached());
  } catch (error) {
    return dependencies.fallback(error);
  }
}
