Never use `_unsafeUnwrap()` on neverthrow `Result` or `ResultAsync` values.

Instead, use functional combinators to propagate errors through the type system:

- **Sync `Result` in an async chain**: Use `.asyncAndThen()` to convert a sync `Result` into a `ResultAsync` chain.
- **`ResultAsync`**: Use `.andThen()` to chain operations.
- **Sync `Result`**: Use `.andThen()`, `.map()`, or check `.isErr()` and return `errAsync()`.

Example — replacing `_unsafeUnwrap()`:

```typescript
// BAD
const result = resolvePluginDir(plugin, cloneDir, pluginRoot)
const pluginDir = result._unsafeUnwrap()
return doSomething(pluginDir)

// GOOD
return resolvePluginDir(plugin, cloneDir, pluginRoot).asyncAndThen(
  (pluginDir) => doSomething(pluginDir),
)
```

This ensures errors are always handled through the Result type rather than throwing at runtime.
