let quoteChain = Promise.resolve();

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function enqueueQuoteRequest<T>(request: () => Promise<T>, delayMs = 250) {
  const run = quoteChain.then(async () => {
    await wait(delayMs);
    return request();
  });

  quoteChain = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}
