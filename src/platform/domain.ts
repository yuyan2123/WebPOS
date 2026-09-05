import initialize, { execute } from "../../public/wasm/pos_domain.js";
import type { DomainOperations } from "../contracts";

let ready: ReturnType<typeof initialize> | null;
export function initializeDomain() {
  ready ||= initialize({ module_or_path: "/wasm/pos_domain_bg.wasm" }).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export function domain<K extends keyof DomainOperations>(
  operation: K,
  input: DomainOperations[K]["input"],
): DomainOperations[K]["output"] {
  return JSON.parse(execute(JSON.stringify({ operation, input })));
}
