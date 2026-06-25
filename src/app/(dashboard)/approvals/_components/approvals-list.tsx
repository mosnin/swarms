"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface ApprovalItem {
  id: string;
  costMinor: number;
  costCurrency: string;
  createdAt: string;
}

export function ApprovalsList({ initial }: { initial: ApprovalItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(jobId: string, action: "approve" | "cancel") {
    setBusy(jobId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Failed to ${action}`);
      setItems((prev) => prev.filter((i) => i.id !== jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No jobs awaiting approval.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Job</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{item.id}</td>
                <td className="p-3 text-xs">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={busy === item.id}
                      onClick={() => act(item.id, "approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === item.id}
                      onClick={() => act(item.id, "cancel")}
                    >
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
