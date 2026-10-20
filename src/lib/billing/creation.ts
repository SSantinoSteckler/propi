// Reserve durably before contacting the provider. Never retry a POST here:
// ambiguous responses must be reconciled using the persisted external reference.
export async function reservedCreation<A, S, R>(dependencies: {
  reserve: () => Promise<A>;
  create: (agreement: A) => Promise<S>;
  persist: (agreement: A, subscription: S) => Promise<R>;
  failed: (agreement: A, error: unknown) => Promise<void>;
}): Promise<R> {
  const agreement = await dependencies.reserve();
  try {
    return await dependencies.persist(agreement, await dependencies.create(agreement));
  } catch (error) {
    await dependencies.failed(agreement, error);
    throw error;
  }
}
