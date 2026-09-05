import { createRequire } from "node:module";
import { HttpsError } from "firebase-functions/v2/https";

const require = createRequire(import.meta.url);
const { execute } = require("../../wasm/pos_domain.js");

export function domain(operation, input) {
  try {
    return JSON.parse(execute(JSON.stringify({ operation, input })));
  } catch (error) {
    throw new HttpsError("invalid-argument", typeof error === "string" ? error : "資料格式不正確");
  }
}
