"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Id } from "@/components/ui/id";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";

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
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No jobs awaiting approval.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DataTable>
        <THead>
          <TR>
            <TH>Job</TH>
            <TH>Estimated cost</TH>
            <TH>Created</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {items.map((item) => (
            <TR key={item.id}>
              <TD className="text-xs">
                <Id value={item.id} />
              </TD>
              <TD className="font-medium tabular-nums">
                {format({ amountMinor: item.costMinor, currency: item.costCurrency })}
              </TD>
              <TD className="text-xs">{new Date(item.createdAt).toLocaleString()}</TD>
              <TD className="text-right">
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
              </TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
