export async function readAfterWrites<T>(input: {
  fetch: () => Promise<T>;
  settled: () => Promise<void>;
  version: () => number;
  maxRounds?: number;
}): Promise<T> {
  const voltas = input.maxRounds ?? 5;
  let dados: T;
  for (let volta = 1; ; volta += 1) {
    const antes = input.version();
    await input.settled();
    dados = await input.fetch();
    if (input.version() === antes || volta >= voltas) return dados;
  }
}
