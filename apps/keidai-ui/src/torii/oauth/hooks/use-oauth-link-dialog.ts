import type { OAuthConnectionStatus, OAuthLinkStatus } from "@keidai/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOAuthConnections,
  getToriiOrigin,
  initiateOAuthLink,
} from "../../api/torii-client.js";
import { openOAuthPopup } from "../utils/open-oauth-popup.js";
import {
  connectionStatusForProvider,
  resolveOAuthLinkOutcome,
  shouldAcceptLinkedOutcome,
} from "../utils/resolve-oauth-link-outcome.js";
import { isToriiOAuthLinkMessage } from "../utils/torii-oauth-link-message.js";

export type OAuthLinkDialogStep =
  | "initiating"
  | "waiting"
  | "linked"
  | "error";

export interface OAuthLinkDialogContext {
  providerId: string;
  providerLabel: string;
  ownerId: string;
  scopes: string[];
  redirectUri: string;
}

const pollIntervalMs = 1_000;
const popupPollIntervalMs = 500;

export type OAuthLinkCompletedHandler = (
  ownerId: string,
  connections: OAuthConnectionStatus[],
) => void | Promise<void>;

export interface OpenOAuthLinkOptions {
  onLinked?: OAuthLinkCompletedHandler;
}

export function useOAuthLinkDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<OAuthLinkDialogStep>("initiating");
  const [context, setContext] = useState<OAuthLinkDialogContext | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onLinkedRef = useRef<OAuthLinkCompletedHandler | undefined>(undefined);
  const isCompletingRef = useRef(false);
  const authWindowRef = useRef<Window | null>(null);
  const authorizationUrlRef = useRef<string | null>(null);
  const activeLinkIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusAtStartRef = useRef<OAuthLinkStatus>("not_linked");
  const sawPendingRef = useRef(false);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearPopupTimer = useCallback(() => {
    if (popupTimerRef.current) {
      clearInterval(popupTimerRef.current);
      popupTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearPollTimer();
    clearPopupTimer();
    authWindowRef.current?.close();
    authWindowRef.current = null;
    authorizationUrlRef.current = null;
    activeLinkIdRef.current = null;
    statusAtStartRef.current = "not_linked";
    sawPendingRef.current = false;
    setOpen(false);
    setContext(null);
    setStep("initiating");
    setErrorMessage(undefined);
    setIsSubmitting(false);
    onLinkedRef.current = undefined;
    isCompletingRef.current = false;
  }, [clearPollTimer, clearPopupTimer]);

  const completeLinkedFlow = useCallback(
    async (ownerId: string, connections: OAuthConnectionStatus[]) => {
      if (isCompletingRef.current) {
        return;
      }

      isCompletingRef.current = true;
      clearPollTimer();
      clearPopupTimer();
      authWindowRef.current?.close();
      authWindowRef.current = null;
      const onLinked = onLinkedRef.current;
      onLinkedRef.current = undefined;

      try {
        await onLinked?.(ownerId, connections);
      } finally {
        close();
      }
    },
    [clearPollTimer, clearPopupTimer, close],
  );

  const openLink = useCallback(
    (next: OAuthLinkDialogContext, options?: OpenOAuthLinkOptions) => {
      clearPollTimer();
      clearPopupTimer();
      authWindowRef.current = null;
      authorizationUrlRef.current = null;
      activeLinkIdRef.current = null;
      statusAtStartRef.current = "not_linked";
      sawPendingRef.current = false;
      onLinkedRef.current = options?.onLinked;
      setContext(next);
      setStep("initiating");
      setErrorMessage(undefined);
      setIsSubmitting(false);
      setOpen(true);
    },
    [clearPollTimer, clearPopupTimer],
  );

  const openAuthWindow = useCallback((url: string) => {
    authorizationUrlRef.current = url;
    authWindowRef.current?.close();
    const popup = openOAuthPopup(url);
    if (!popup) {
      throw new Error(
        "Popup blocked. Allow popups for this site and try again.",
      );
    }
    authWindowRef.current = popup;
  }, []);

  const pollConnectionStatus = useCallback(async (): Promise<boolean> => {
    if (!context) {
      return false;
    }

    const response = await fetchOAuthConnections(context.ownerId);
    const currentStatus = connectionStatusForProvider(
      response.connections,
      context.providerId,
    );
    if (currentStatus === "pending") {
      sawPendingRef.current = true;
    }

    const outcome = resolveOAuthLinkOutcome(
      response.connections,
      context.providerId,
    );

    if (
      shouldAcceptLinkedOutcome(outcome, {
        statusAtStart: statusAtStartRef.current,
        sawPending: sawPendingRef.current,
      })
    ) {
      await completeLinkedFlow(context.ownerId, response.connections);
      return true;
    }

    if (outcome.kind === "failed") {
      clearPollTimer();
      clearPopupTimer();
      setErrorMessage(outcome.error);
      setStep("error");
    }

    return false;
  }, [clearPollTimer, clearPopupTimer, completeLinkedFlow, context]);

  const confirmFinished = useCallback(() => {
    void pollConnectionStatus();
  }, [pollConnectionStatus]);

  const beginAuthorization = useCallback(async () => {
    if (!context) {
      return;
    }

    setIsSubmitting(true);
    try {
      const connections = await fetchOAuthConnections(context.ownerId);
      statusAtStartRef.current = connectionStatusForProvider(
        connections.connections,
        context.providerId,
      );
      sawPendingRef.current = false;

      const initiate = await initiateOAuthLink(context.providerId, context.ownerId);
      activeLinkIdRef.current = initiate.linkId;
      setContext((current) =>
        current
          ? { ...current, redirectUri: initiate.redirectUri }
          : current,
      );
      openAuthWindow(initiate.authorizationUrl);
      setStep("waiting");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not start authorization",
      );
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  }, [context, openAuthWindow]);

  const reopenAuthorization = useCallback(() => {
    if (authorizationUrlRef.current) {
      try {
        openAuthWindow(authorizationUrlRef.current);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not reopen popup",
        );
        setStep("error");
      }
      return;
    }

    void beginAuthorization();
  }, [beginAuthorization, openAuthWindow]);

  const retry = useCallback(() => {
    authorizationUrlRef.current = null;
    authWindowRef.current = null;
    activeLinkIdRef.current = null;
    statusAtStartRef.current = "not_linked";
    sawPendingRef.current = false;
    setErrorMessage(undefined);
    setStep("initiating");
  }, []);

  useEffect(() => {
    if (!open || step !== "waiting" || !context) {
      return;
    }

    const toriiOrigin = getToriiOrigin();

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== toriiOrigin || !isToriiOAuthLinkMessage(event.data)) {
        return;
      }

      if (
        activeLinkIdRef.current &&
        event.data.linkId &&
        event.data.linkId !== activeLinkIdRef.current
      ) {
        return;
      }

      if (event.data.provider !== context.providerId) {
        return;
      }

      if (event.data.status === "error") {
        clearPollTimer();
        clearPopupTimer();
        setErrorMessage(event.data.error ?? "Authorization failed");
        setStep("error");
        return;
      }

      sawPendingRef.current = true;
      void pollConnectionStatus();
    };

    window.addEventListener("message", handleMessage);

    void pollConnectionStatus();
    pollTimerRef.current = setInterval(() => {
      void pollConnectionStatus();
    }, pollIntervalMs);

    popupTimerRef.current = setInterval(() => {
      if (!authWindowRef.current?.closed) {
        return;
      }

      clearPopupTimer();
      void pollConnectionStatus();
    }, popupPollIntervalMs);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearPollTimer();
      clearPopupTimer();
    };
  }, [
    clearPollTimer,
    clearPopupTimer,
    context,
    open,
    pollConnectionStatus,
    step,
  ]);

  return {
    open,
    step,
    context,
    errorMessage,
    isSubmitting,
    openLink,
    close,
    beginAuthorization,
    reopenAuthorization,
    confirmFinished,
    retry,
  };
}
