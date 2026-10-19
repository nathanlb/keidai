import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { OwnerAvatar } from "../shell/components/owner-avatar/owner-avatar.js";
import { deriveOwnerInitials } from "../shell/utils/derive-owner-initials.js";
import {
  activeAdminCount,
  deleteOwner,
  fetchOwners,
  ownerRowLocks,
  updateOwner,
  type OwnerRecord,
  type OwnerStatus,
} from "../lib/api/owners.js";
import type { OperatorRole } from "@keidai/shared";

const OWNERS_KEY = "owners";

function ownerLabel(owner: OwnerRecord): string {
  return owner.displayName?.trim() || owner.email?.trim() || owner.ownerId;
}

export function OperatorsRolesCard({
  currentOwnerId,
}: {
  currentOwnerId: string | undefined;
}) {
  const { data, error, isLoading, mutate } = useSWR(OWNERS_KEY, fetchOwners);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const owners = data?.owners ?? [];
  const admins = activeAdminCount(owners);

  async function changeOwner(
    owner: OwnerRecord,
    patch: { role?: OperatorRole; status?: OwnerStatus },
  ) {
    setPendingId(owner.ownerId);
    setRowError(null);
    try {
      await updateOwner(owner.ownerId, patch);
      await mutate();
    } catch (cause) {
      setRowError(
        cause instanceof Error ? cause.message : "Could not update operator",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function removeOwner(owner: OwnerRecord) {
    setPendingId(owner.ownerId);
    setRowError(null);
    try {
      await deleteOwner(owner.ownerId);
      await mutate();
    } catch (cause) {
      setRowError(
        cause instanceof Error ? cause.message : "Could not remove operator",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Operators & roles</CardTitle>
        <CardDescription>
          People who can sign in. Admins manage connectors, credentials, and
          this roster. Members work with their own agents.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {isLoading ? (
          <p className="flex items-center gap-2 px-6 text-sm text-muted-foreground">
            <Spinner className="size-4" aria-hidden />
            Loading operators…
          </p>
        ) : null}
        {error ? (
          <p className="px-6 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not load operators"}
          </p>
        ) : null}
        {rowError ? (
          <p className="px-6 pb-3 text-sm text-destructive">{rowError}</p>
        ) : null}
        {owners.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => {
                const locks = ownerRowLocks(owner, currentOwnerId, admins);
                const busy = pendingId === owner.ownerId;
                const label = ownerLabel(owner);
                return (
                  <TableRow key={owner.ownerId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <OwnerAvatar
                          initials={deriveOwnerInitials(label)}
                          picture={owner.pictureUrl ?? undefined}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {label}
                            {owner.ownerId === currentOwnerId ? (
                              <Badge variant="secondary" className="ml-2">
                                You
                              </Badge>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {owner.email ?? "No email"}
                            <span className="mx-1">·</span>
                            <span className="font-mono">{owner.ownerId}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        aria-label={`Role for ${label}`}
                        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                        value={owner.role}
                        disabled={locks.role || busy}
                        onChange={(event) =>
                          void changeOwner(owner, {
                            role: event.target.value as OperatorRole,
                          })
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <select
                        aria-label={`Status for ${label}`}
                        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                        value={owner.status}
                        disabled={locks.status || busy}
                        onChange={(event) =>
                          void changeOwner(owner, {
                            status: event.target.value as OwnerStatus,
                          })
                        }
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${label}`}
                        disabled={locks.delete || busy}
                        onClick={() => void removeOwner(owner)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
