import { Link } from "react-router";
import { Search, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useTheme } from "~/lib/theme-provider";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <Button variant="ghost" size="icon-sm" onClick={cycle} aria-label="Toggle theme">
      {theme === "light" && <Sun className="size-3.5" />}
      {theme === "dark" && <Moon className="size-3.5" />}
      {theme === "system" && <Monitor className="size-3.5" />}
    </Button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-sm font-medium text-foreground hover:text-foreground/80">
            Holocron
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link to="/search" aria-label="Search">
                <Search className="size-3.5" />
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}

