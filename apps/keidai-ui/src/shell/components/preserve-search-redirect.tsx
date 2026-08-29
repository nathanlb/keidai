import { Navigate, useLocation } from "react-router";

export function PreserveSearchRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

export function PrefixRedirect({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const { pathname, search } = useLocation();
  const suffix = pathname.startsWith(from) ? pathname.slice(from.length) : "";
  return <Navigate to={{ pathname: `${to}${suffix}`, search }} replace />;
}
