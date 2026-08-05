import { Button, Input } from "@keidai/ui";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

export interface BearerIdentityPanelProps {
  bearerId: string;
  displayName: string;
  grantCount: number;
  firstGrantedSlug: string | null;
  onRename: (displayName: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function BearerIdentityPanel({
  bearerId,
  displayName,
  grantCount,
  firstGrantedSlug,
  onRename,
  onDelete,
}: BearerIdentityPanelProps) {
  const [nameDraft, setNameDraft] = useState(displayName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);

  const trimmed = nameDraft.trim();
  const dirty = trimmed !== displayName && trimmed.length > 0;

  async function handleSave() {
    if (!dirty) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onRename(trimmed);
      setNameDraft(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename bearer");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bearer");
      setIsDeleting(false);
    }
  }

  const grantLabel = `${grantCount} grant${grantCount === 1 ? "" : "s"}`;
  const deleteHint = confirmDelete
    ? `This removes the record and its ${grantLabel}. Any credential still mapped to ${bearerId} will fail validation.`
    : `Removes the record and cascades its ${grantLabel}. Past traces keep the id — they are not rewritten.`;

  const pathAgent = firstGrantedSlug
    ? `agent_id = ${firstGrantedSlug}`
    : "no grant → 403";

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-[18px] py-3.5">
            <div className="text-sm font-semibold">Display name</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              The only mutable field on a bearer record.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-[18px] py-4">
            <Input
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setConfirmDelete(false);
              }}
              className="h-9.5 max-w-[360px]"
              aria-label="Display name"
            />
            <Button
              type="button"
              size="sm"
              className="h-9.5"
              disabled={!dirty || isSaving}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9.5"
                onClick={() => setNameDraft(displayName)}
              >
                Discard
              </Button>
            ) : null}
          </div>
          <div className="border-t border-border px-[18px] py-3 text-xs leading-snug text-muted-foreground">
            The{" "}
            <span className="font-mono text-foreground">bearer_id</span> is
            fixed at registration — validator mappings and minted tokens
            reference it.
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-destructive/40 bg-card px-[18px] py-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">Delete this bearer</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {deleteHint}
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="ml-auto shrink-0"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {confirmDelete ? "Confirm delete" : "Delete bearer"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-[15px] py-3.5">
          <Activity className="size-3.5 text-muted-foreground" aria-hidden />
          <div className="text-[13px] font-semibold">Exchange path</div>
        </div>
        <div className="px-[15px] py-3.5 font-mono text-[11.5px] leading-[1.85] text-muted-foreground">
          <div>POST /token</div>
          <div className="text-foreground">subject_token</div>
          <div>&nbsp;&nbsp;↓ validator</div>
          <div className="text-foreground">{bearerId}</div>
          <div>&nbsp;&nbsp;↓ bearer_agent_grants</div>
          <div className="text-foreground">{pathAgent}</div>
          <div>&nbsp;&nbsp;↓ mint</div>
          <div className="text-foreground">jwt{"{ agent_id, bearer_id }"}</div>
        </div>
        <div className="border-t border-border px-[15px] py-3 text-[11.5px] leading-relaxed text-muted-foreground">
          Both ids ride in the token, so Torii&apos;s traces name the process
          and the identity it assumed.
        </div>
      </div>
    </div>
  );
}
