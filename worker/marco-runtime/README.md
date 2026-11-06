# Original MARCO inside a Cloudflare Worker

This adapter executes the original MARCO Python `engine.Session` in CPython 3.14.2 through pinned Pyodide 314.0.7. It is not a JavaScript imitation, external HTTP service, LLM, or browser-only runtime. It uses NumPy 2.4.6. `/evaluate` remains the source-bound deterministic rule function; `/question` and `/fact` require actual native MARCO graph evidence.

## Reproducible runtime artifacts

Run `python3 prepare-runtime.py --cache /tmp/marco-runtime-cache` from any directory. It downloads the pinned official Pyodide npm tarball, matching official NumPy wheel and12 checksum-pinned MARCO source files from the specified training commit, verifies their SHA-512/SHA-256 hashes, reconstructs all 16 runtime modules, and verifies every generated file against `runtime-manifest.json` before writing. No shell subprocess or third-party script is executed. `runtime/`, `marco-files.json`, the two large `vendor/pyodide.asm*.mjs` files and `vendor/numpy.original.whl` are ignored in Git; run preparation before build and include `runtime/*` in the Sites deployment archive. The preparation script fetches the exact MARCO training commit and validates all12 source files, and regenerates the Pyodide host adaptation with pinned output hashes. The script, host adapter, small loader source, licenses and manifests remain tracked.

## Integration

Copy this directory into the application's worker sources, excluding `bundle.mjs`, `test-entry.mjs` and `adapter-before-gc.mjs`. Import `health` and `dispatch` from `adapter.mjs`. Both return promises. Routes accepted by dispatch are `/question`, `/fact`, `/classify`, `/evaluate` with JSON objects matching the source module. Health loads the runtime and checks a real native-engine answer before reporting success.

Keep `runtime/*` as separate deployable modules. The runtime contains 14 `.wasm` files to import as precompiled WASM, and two ZIP files to import as binary Data modules. Esbuild should mark binary imports external, normalize their output path to `./runtime/<basename>`, and the build should copy `runtime/*` into `dist/server/runtime/`. Do not base64-inline WASM or use runtime WebAssembly compilation. If the hosting module resolver recognizes `.bin` rather than `.zip` as Data, rename the two ZIP files and update their import paths; their format and contents stay ZIP.

Exports:
- `health()`: actual runtime status, code/knowledge provenance, no-LLM/no-persistence declarations and current WASM linear memory.
- `dispatch(path, data)`: a source-module result object. The path is whitelisted. JSON input is assigned as strings via Pyodide globals, never interpolated into Python code.
- `CONTRACT`: pinned knowledge/source metadata.

Lazy initialization is cached. All calls are serialized. Temporary request globals are removed after each operation, and Python GC runs after each request to prevent session cycles from growing WASM memory. Failed initialization clears its promise so later requests can retry. Uncaught execution failures discard the cached runtime. The application must fail closed when an error is raised.

## Host adaptations

Only Pyodide host-loading JavaScript is modified. Original MARCO Python files are unchanged and individually hashed in `source-manifest.json`.

1. The standard-library ZIP is imported as static binary data rather than fetched.
2. The main WASM module uses the documented custom Emscripten constructor hook and static compilation supplied by the host. The unused default WASM fetch is omitted.
3. Cloudflare Workers with `nodejs_compat` are recognized as Workers, rather than full Node.js processes.
4. The supported JavaScript timer shim substitutes for Emscripten's browser `postMessage` fallback.
5. Python import caches are invalidated after bundled file extraction and source mounting. This fixes production startup when file mtimes do not change during a request.
6. NumPy extensions are precompiled Worker modules and registered with exported Emscripten dynamic-loader helpers. This is a pinned, experimental integration dependency; retest before upgrading Pyodide.

No eval permission, runtime code-generation permission, broad networking permission, or Python Worker compatibility flag is enabled. Generic unused eval helpers are present in upstream Emscripten code, but none are invoked by the tested MARCO path. Workerd's security restrictions remain active.

`numpy-provenance.json` records the upstream official wheel hash. Its Python files/metadata are preserved. The extension binaries are stored once as precompiled WASM; zero-byte placeholders allow CPython extension discovery. The derived ZIP has its own verified checksum. All extension bytes match their upstream wheel bytes.

## Validation and limits

The sibling `test-integration.mjs` harness tests this build using real local Cloudflare workerd via Miniflare, with an outbound handler that rejects all network calls. It checks 21 declared questions across 100 repeated native-engine answers, eight concurrent requests, an unsupported future date, an injection-like unregistered question, and an exact integer calculation. `benchmark-workerd-result.json` contains measured results. The nodejs-compatible test uses the same checks with `nodejs_compat` enabled.

Initial optimized run: zero outbound calls; 100 repeated and eight concurrent calls passed; WASM linear memory stable at 45,350,912 bytes (43.25 MiB), median warm HTTP round trip approximately 25 ms. These are local measurements. WASM linear memory is not total isolate memory. The production host's module typing, aggregate module-size limit, cold CPU allowance, memory and deployment health still require verification.

The runtime plus test-entry JS is approximately 9.06 MiB gzip when every module is separately gzipped. Application code adds size. The bundler's actual deployed-size accounting is authoritative. Cold local startup takes several seconds. Measure real deployment before claiming production readiness.

## Attribution and licenses

Display: **Powered by MARCO — Created by DoTaeIn, Original project: https://github.com/DoTaeIn/Marco**.

Graph attribution: **Knowledge graphs from MARCO by DoTaeIn, https://github.com/DoTaeIn/Marco, CC BY 4.0**.

MARCO uses its custom MARCO Engine License, which includes Apache 2.0 text and a visible-attribution condition. It must not be described as plain Apache 2.0. Graphs are CC BY 4.0. See `licenses/` for the full licenses and notices. Pyodide is MPL 2.0; original and modified host JS is retained under `vendor/`. CPython and NumPy license notices are also retained. Pyodide source: https://github.com/pyodide/pyodide/tree/314.0.7 ; CPython source: https://github.com/python/cpython/tree/v3.14.2 .
