import { Navigate, useLocation } from "react-router-dom";

/** The old Records Room address keeps working, with its shelf and box (30 Oct 2026). */
export function ShelvesRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/records", search }} replace />;
}
