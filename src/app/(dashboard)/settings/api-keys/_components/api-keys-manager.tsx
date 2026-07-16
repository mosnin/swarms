"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
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
  /** Id of the key whose Revoke button is armed, awaiting a confirming click. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** Id of the key whose revoke request is in flight. */
  const [revokingId, setRevokingId] = useState<string | null>(null);

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
    setConfirmingId(null);
    setRevokingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to revoke key");
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...body.data.key } : k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
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

      <DataTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Prefix</TH>
            <TH>Scopes</TH>
            <TH>Status</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {keys.length === 0 && <EmptyRow colSpan={5}>No API keys yet.</EmptyRow>}
          {keys.map((key) => (
            <TR key={key.id}>
              <TD>{key.name}</TD>
              <TD className="font-mono text-xs">{key.prefix}…</TD>
              <TD className="text-xs">{key.scopes.length || "agent"}</TD>
              <TD>
                <StatusPill status={key.revokedAt ? "revoked" : "active"} />
              </TD>
              <TD className="text-right">
                {!key.revokedAt &&
                  (confirmingId === key.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={revokingId !== null}
                        onClick={() => revoke(key.id)}
                      >
                        Confirm revoke
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revokingId !== null}
                        onClick={() => setConfirmingId(null)}
                      >
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revokingId !== null}
                      onClick={() => setConfirmingId(key.id)}
                    >
                      {revokingId === key.id ? "Revoking…" : "Revoke…"}
                    </Button>
                  ))}
              </TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
