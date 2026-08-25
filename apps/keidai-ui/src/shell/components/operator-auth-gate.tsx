import { Button, Spinner } from "@keidai/ui";
import { LogIn } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { PageEmptyState } from "../components/page-content/page-empty-state.js";
import { useOperatorSession } from "../hooks/use-operator-session.js";

function describeAuthError(code: string | null): string | null {
  if (!code) {
    return null;
  }

  switch (code) {
    case "access_denied":
      return "Google sign-in was cancelled.";
    case "missing_code":
    case "invalid_state":
    case "token_exchange":
      return "Sign-in failed. Try again.";
    case "forbidden":
      return "That Google account is not an allowlisted operator.";
    default:
      return "Sign-in failed. Try again.";
  }
}

/**
 * Gates the operator shell on a valid BFF Google OIDC session.
 * Unauthenticated (or missing session endpoint) operators must sign in.
 */
export function OperatorAuthGate({ children }: { children: ReactNode }) {
  const { status } = useOperatorSession();
  const [searchParams] = useSearchParams();

  const banner = useMemo(() => {
    if (searchParams.get("signed_out") === "1") {
      return "Signed out.";
    }
    return describeAuthError(searchParams.get("auth_error"));
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (status === "authenticated") {
    return children;
  }

  return (
    <div className="
      flex h-screen items-center justify-center bg-background px-5
    ">
      <div className="w-full max-w-md">
        <PageEmptyState
          icon={<LogIn className="size-5" />}
          title="Sign in to Keidai"
          description={
            banner ??
            "Operator access requires a Google account on the allowlist."
          }
          action={
            <Button asChild>
              <a href="/auth/login">Continue with Google</a>
            </Button>
          }
        />
      </div>
    </div>
  );
}
