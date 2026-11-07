// Resolves the "@/…" imports of lib/ for node --test, which reads no tsconfig paths.
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    return next(spec.startsWith("@/") ? new URL("../" + spec.slice(2) + ".ts", ${JSON.stringify(import.meta.url)}).href : spec, ctx);
  }`));
