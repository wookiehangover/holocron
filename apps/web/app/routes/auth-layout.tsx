import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/auth-layout";
import { isAuthenticated, isPasswordRequired } from "~/lib/auth.server";

// ---------------------------------------------------------------------------
// Loader — gate all child routes behind authentication
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  if (isPasswordRequired() && !isAuthenticated(request)) {
    throw redirect("/login");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component — passthrough layout, just renders child routes
// ---------------------------------------------------------------------------

export default function AuthLayout() {
  return <Outlet />;
}

