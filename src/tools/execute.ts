import { executeCode } from "../sandbox/runtime.js";
import type { ExecuteCodeInput } from "../schemas.js";

/**
 * Execute TypeScript/JavaScript code in sandbox
 */
export async function handleExecuteCode(params: ExecuteCodeInput) {
  const result = await executeCode(params.code, params.timeout);

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: { ...result },
    isError: !!result.error,
  };
}
