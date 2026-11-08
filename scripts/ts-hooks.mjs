// Node harness for dev scripts: lets `node --import ./scripts/ts-hooks.mjs` load the
// app's TypeScript modules directly (Node strips types; this adds the missing `.ts`).
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw err;
    }
  },
});
