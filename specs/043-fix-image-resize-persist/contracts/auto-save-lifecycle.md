# Contract: Auto-Save Lifecycle

## useAutoSave Hook Behavior

### Trigger-Save-Flush Lifecycle

| Event                                 | Current Behavior                                | Fixed Behavior                                                 |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `trigger()` called                    | Sets 800ms debounce timer                       | No change                                                      |
| Debounce timer fires                  | Calls `performSave()`                           | No change                                                      |
| Component unmounts with pending timer | **Clears timer, save lost**                     | **Fires `saveFnRef.current()` immediately, then clears timer** |
| `beforeunload` event                  | Calls `flush()` (async)                         | No change                                                      |
| `flush()` called                      | Clears timer, calls `performSave()` immediately | No change                                                      |

### Guarantees (after fix)

1. **No data loss on SPA navigation**: Any pending debounced save will execute before the component fully unmounts.
2. **No navigation blocking**: The save is fire-and-forget (non-awaited). Navigation proceeds immediately.
3. **No duplicate saves**: The timer is cleared before firing the save, so the debounced save won't also fire.
4. **Error tolerance**: The fire-and-forget save uses `.catch(() => {})` to silently swallow errors on unmount (no error UI available after unmount).
