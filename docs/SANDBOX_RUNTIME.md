# Sandbox Runtime

> **Honest status: there is NO production-safe sandbox in this repository.**
> Hermes Cloud ships a sandbox *interface* and a clearly-labeled development
> *stub* that performs no isolation and refuses to execute commands. No code path
> runs untrusted third-party skill code. Public marketplace execution of
> untrusted code is therefore **blocked** until a real sandbox exists.

## What exists today

| Piece | File | Notes |
|---|---|---|
| Provider interface | `src/server/sandbox/types.ts` | `createSandbox`, `uploadSkillBundle`, `runCommand`, `readFile`, `writeFile`, `collectArtifacts`, `terminateSandbox` |
| **Container provider** | `src/server/sandbox/dockerSandboxProvider.ts` | **real isolation**: `--network=none`, `--read-only`, tmpfs workdir, `--memory`/`--cpus`/`--pids-limit`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, non-root user, empty env (no host secrets). `isProductionSafe = true`. Enabled via `SANDBOX_PROVIDER=docker\|podman`. |
| Dev stub | `src/server/sandbox/localStubSandboxProvider.ts` | `isProductionSafe = false`; `runCommand` throws |
| Selector | `src/server/sandbox/sandboxProvider.ts` | uses the container provider when configured; else the dev stub (refused in production) |

The container provider is a genuine isolation boundary suitable for semi-trusted
code. For **fully untrusted multi-tenant** code, a microVM (Firecracker) or
gVisor is stronger and recommended — the same provider interface accepts such an
adapter without changing call sites.

Today's runners are `mock` (deterministic), `http` (calls a vetted external
endpoint with timeout), and `local_worker` (disabled stub). None execute
arbitrary uploaded code, so no sandbox is currently invoked in the execution
path.

## Requirements for a production sandbox

A provider may set `isProductionSafe = true` only when it enforces ALL of:

1. **Network policy per job** — default deny-all egress; explicit per-job
   allowlist (`SandboxLimits.egressAllowlist`).
2. **Filesystem isolation** — no access to the host filesystem; ephemeral,
   per-job root.
3. **CPU limit** — enforced (`cpuMillis`).
4. **Memory limit** — enforced (`memoryMb`), OOM-killed past the cap.
5. **Runtime timeout** — hard wall-clock kill (`timeoutMs`).
6. **No host secret access** — no host env vars, no instance metadata, no
   mounted credentials.
7. **Connector access only through a broker** — the sandbox never holds connector
   secrets; it calls a broker that applies the job's granted scopes + approval.
8. **Output size limit** — truncate/reject past `maxOutputBytes`.
9. **Artifact scanning** — collected artifacts are hashed and scanned before they
   leave the sandbox (scanner is a placeholder today).
10. **Full audit trail** — sandbox create/run/terminate emit audit events.

## Candidate production adapters (future)

- **Firecracker-style microVM** — strongest isolation; per-job VM.
- **gVisor / hardened container worker** — userspace kernel; container per job.
- **Remote secure execution provider** — e.g. a managed code-execution service
  with the guarantees above.

## Gate before running untrusted third-party code

Do not enable any provider for untrusted code until:

- A provider with `isProductionSafe = true` passes an isolation test suite
  (egress denied, host secrets unreachable, limits enforced, timeout kills).
- The connector broker mediates all external tool access.
- Creator review + skill risk labeling are in place (see marketplace docs).

Until then, `getSandboxProvider()` throws in production and the platform executes
only first-party `mock`/`http` runners.
