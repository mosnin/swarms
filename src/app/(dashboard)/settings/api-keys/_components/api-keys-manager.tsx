"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PERMISSIONS, type Permission } from "@/modules/identity/roles";

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  scopes: Permission[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function ApiKeysManager({ initialKeys }: { initialKeys: ApiKeyListItem[] }) {
  const [keys, setKeys] = useState<ApiKeyListItem[]>(initialKeys);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Permission[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleScope(scope: Permission) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, scopes: scopes.length ? scopes : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to create key");
      setCreated(body.data.plaintext);
      setKeys((prev) => [{ ...body.data.key }, ...prev]);
      setName("");
      setScopes([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to revoke key");
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...body.data.key } : k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Create API key</h2>
        <div className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. ci-agent)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <details className="text-sm">
            <summary className="cursor-pointer select-none">
              Scopes ({scopes.length ? `${scopes.length} selected` : "agent defaults"})
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {PERMISSIONS.map((permission) => (
                <label key={permission} className="flex items-center gap-2 font-mono text-xs">
                  <input
                    type="checkbox"
                    checked={scopes.includes(permission)}
                    onChange={() => toggleScope(permission)}
                  />
                  {permission}
                </label>
              ))}
            </div>
          </details>
          <Button onClick={create} disabled={busy || name.trim().length === 0}>
            {busy ? "Creating…" : "Create key"}
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {created && (
          <div className="mt-3 rounded-md bg-muted p-3 text-sm">
            <p className="font-semibold">Copy your key now — it will not be shown again:</p>
            <code className="mt-1 block break-all font-mono">{created}</code>
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Prefix</th>
              <th className="p-3 font-medium">Scopes</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  No API keys yet.
                </td>
              </tr>
            )}
            {keys.map((key) => (
              <tr key={key.id} className="border-b last:border-0">
                <td className="p-3">{key.name}</td>
                <td className="p-3 font-mono text-xs">{key.prefix}…</td>
                <td className="p-3 text-xs">{key.scopes.length || "agent"}</td>
                <td className="p-3">
                  {key.revokedAt ? (
                    <span className="text-xs text-destructive">revoked</span>
                  ) : (
                    <span className="text-xs text-green-600">active</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {!key.revokedAt && (
                    <Button variant="outline" size="sm" onClick={() => revoke(key.id)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
