import { Navigate, useLocation } from "react-router";

export function PreserveSearchRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}
