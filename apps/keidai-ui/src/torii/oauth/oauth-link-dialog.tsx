import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@keidai/ui";
import {
  Check,
  ExternalLink,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { OAuthLinkDialogStep } from "./hooks/use-oauth-link-dialog.js";
import type { OAuthLinkDialogContext } from "./hooks/use-oauth-link-dialog.js";

function Mono({ children }: { children: string }) {
  return <span className="font-mono">{children}</span>;
}

interface InitiatingStepProps {
  providerLabel: string;
  ownerId: string;
  scopes: string[];
  hasConfiguredScopes: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onBeginAuthorization: () => void;
}

function InitiatingStep({
  providerLabel,
  ownerId,
  scopes,
  hasConfiguredScopes,
  isSubmitting,
  onClose,
  onBeginAuthorization,
}: InitiatingStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Link {providerLabel}</DialogTitle>
        <DialogDescription>
          Torii will open {providerLabel} authorization in your browser
          {hasConfiguredScopes ? " with the configured scopes" : ""}. Grant
          access for owner <Mono>{ownerId}</Mono>.
        </DialogDescription>
      </DialogHeader>

      {hasConfiguredScopes ? (
        <div className="mt-4 flex flex-col gap-[7px] rounded-lg border border-border px-3.5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Scopes requested
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scopes.map((scope) => (
              <Badge
                key={scope}
                variant="secondary"
                className="font-mono text-[11px] font-normal"
              >
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-1.5 rounded-lg border border-border px-3.5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Authorization
          </div>
          <p className="text-[13px] leading-normal text-muted-foreground">
            {providerLabel} does not declare scopes in <Mono>torii.yaml</Mono>.
            Torii requests provider-default access during authorization.
          </p>
        </div>
      )}

      <DialogFooter className="mt-6 sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onBeginAuthorization} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ExternalLink className="size-4" aria-hidden />
          )}
          Open authorization
        </Button>
      </DialogFooter>
    </>
  );
}

interface WaitingStepProps {
  providerLabel: string;
  redirectUri: string;
  onClose: () => void;
  onReopenAuthorization: () => void;
  onConfirmFinished: () => void;
}

function WaitingStep({
  providerLabel,
  redirectUri,
  onClose,
  onReopenAuthorization,
  onConfirmFinished,
}: WaitingStepProps) {
  return (
    <>
      <div className="flex flex-col items-center px-1 pt-2 text-center">
        <Loader2
          className="size-[34px] animate-spin text-primary"
          aria-hidden
        />
        <div className="mt-4 text-base font-semibold">
          Waiting for authorization in {providerLabel}
        </div>
        <p className="mt-1.5 max-w-[330px] text-[13px] leading-normal text-muted-foreground">
          Finish authorization in the popup window. This dialog will close
          automatically when Torii receives the callback at{" "}
          <Mono>{redirectUri}</Mono>.
        </p>
      </div>

      <div className="mt-[18px] flex gap-2">
        <Button
          variant="ghost"
          className="flex-1 text-muted-foreground"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={onReopenAuthorization}
        >
          Reopen popup
        </Button>
        <Button
          variant="ghost"
          className="flex-1 text-muted-foreground"
          onClick={onConfirmFinished}
        >
          Check now
        </Button>
      </div>
    </>
  );
}

interface LinkedStepProps {
  providerLabel: string;
  ownerId: string;
  onClose: () => void;
}

function LinkedStep({ providerLabel, ownerId, onClose }: LinkedStepProps) {
  return (
    <>
      <div className="flex flex-col items-center px-1 pt-2 text-center">
        <span className="flex size-[42px] items-center justify-center rounded-full bg-success/20 text-success">
          <Check className="size-[22px]" aria-hidden />
        </span>
        <div className="mt-3.5 text-base font-semibold">
          {providerLabel} linked
        </div>
        <p className="mt-1.5 max-w-[330px] text-[13px] leading-normal text-muted-foreground">
          Torii stored the grant for owner <Mono>{ownerId}</Mono> and will
          refresh it automatically. Calls needing {providerLabel} will now
          resolve.
        </p>
      </div>

      <DialogFooter className="mt-3.5 justify-center sm:justify-center">
        <Button className="min-w-[120px]" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

interface ErrorStepProps {
  errorMessage?: string;
  onClose: () => void;
  onRetry: () => void;
}

function ErrorStep({ errorMessage, onClose, onRetry }: ErrorStepProps) {
  return (
    <>
      <div className="flex flex-col items-center px-1 pt-2 text-center">
        <span className="flex size-[42px] items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <TriangleAlert className="size-[22px]" aria-hidden />
        </span>
        <div className="mt-3.5 text-base font-semibold">
          Authorization didn&apos;t complete
        </div>
        <p className="mt-1.5 max-w-[330px] text-[13px] leading-normal text-muted-foreground">
          <Mono>{errorMessage ?? "access_denied"}</Mono> — the request was
          cancelled, or the provider&apos;s <Mono>redirect_uri</Mono> doesn&apos;t
          match the gateway. No grant was stored.
        </p>
      </div>

      <DialogFooter className="mt-3.5 sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onRetry}>Try again</Button>
      </DialogFooter>
    </>
  );
}

interface OAuthLinkDialogProps {
  open: boolean;
  step: OAuthLinkDialogStep;
  context: OAuthLinkDialogContext | null;
  errorMessage?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onBeginAuthorization: () => void;
  onReopenAuthorization: () => void;
  onConfirmFinished: () => void;
  onRetry: () => void;
}

export function OAuthLinkDialog({
  open,
  step,
  context,
  errorMessage,
  isSubmitting,
  onClose,
  onBeginAuthorization,
  onReopenAuthorization,
  onConfirmFinished,
  onRetry,
}: OAuthLinkDialogProps) {
  if (!context) {
    return null;
  }

  const { providerLabel, ownerId, scopes, redirectUri } = context;
  const hasConfiguredScopes = scopes.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0 sm:rounded-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="p-6">
          {step === "initiating" ? (
            <InitiatingStep
              providerLabel={providerLabel}
              ownerId={ownerId}
              scopes={scopes}
              hasConfiguredScopes={hasConfiguredScopes}
              isSubmitting={isSubmitting}
              onClose={onClose}
              onBeginAuthorization={onBeginAuthorization}
            />
          ) : null}

          {step === "waiting" ? (
            <WaitingStep
              providerLabel={providerLabel}
              redirectUri={redirectUri}
              onClose={onClose}
              onReopenAuthorization={onReopenAuthorization}
              onConfirmFinished={onConfirmFinished}
            />
          ) : null}

          {step === "linked" ? (
            <LinkedStep
              providerLabel={providerLabel}
              ownerId={ownerId}
              onClose={onClose}
            />
          ) : null}

          {step === "error" ? (
            <ErrorStep
              errorMessage={errorMessage}
              onClose={onClose}
              onRetry={onRetry}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
