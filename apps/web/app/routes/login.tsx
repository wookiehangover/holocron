import { data, Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import {
  isAuthenticated,
  isPasswordRequired,
  checkPassword,
  getAuthCookieHeader,
} from "~/lib/auth.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

// ---------------------------------------------------------------------------
// Loader — redirect to / if already authenticated or no password required
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  if (!isPasswordRequired() || isAuthenticated(request)) {
    throw redirect("/");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Action — validate password and set auth cookie
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = formData.get("password");

  if (typeof password !== "string" || !checkPassword(password)) {
    return data({ error: "Incorrect password" }, { status: 401 });
  }

  throw redirect("/", {
    headers: { "Set-Cookie": getAuthCookieHeader() },
  });
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta() {
  return [{ title: "Login — Holocron" }];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Holocron</CardTitle>
          <CardDescription>Enter the site password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="POST" className="space-y-4">
            <div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                required
                autoFocus
                autoComplete="off"
                data-1p-ignore
                aria-invalid={!!actionData?.error}
              />
              {actionData?.error && (
                <p className="mt-2 text-sm text-destructive">{actionData.error}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

