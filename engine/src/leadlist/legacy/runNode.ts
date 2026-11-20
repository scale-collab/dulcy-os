// Runs one copied n8n Code-node script unchanged. The script sees the same globals it had in
// n8n: $input (this node's input items) and $('Node name') (an earlier node's output). It has
// no network, file or process access: only plain JavaScript (JSON, Math, Date, URL, ...).
import vm from 'node:vm';

export type Items = Record<string, any>[];

export async function runNode(code: string, input: Items, earlier: Record<string, Items> = {}): Promise<Items> {
  const wrap = (list: Items) => ({
    first: () => ({ json: list[0] }), last: () => ({ json: list[list.length - 1] }),
    all: () => list.map((json) => ({ json })), item: { json: list[0] },
  });
  const sandbox: Record<string, unknown> = {
    $input: wrap(input),
    $json: input[0],
    $: (name: string) => {
      if (!earlier[name]) throw new Error(`n8n node "${name}" has no output in this run`);
      return wrap(earlier[name]);
    },
    console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone,
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const out = await vm.runInContext(`(async () => {\n${code}\n})()`, context, { timeout: 30_000 });
  if (!Array.isArray(out)) throw new Error('n8n node did not return a list of items');
  // Plain copies, so nothing from the sandbox leaks out.
  return JSON.parse(JSON.stringify(out.map((x: any) => x?.json ?? x)));
}
