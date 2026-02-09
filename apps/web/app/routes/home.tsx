import type { HolocronFile } from "@holocron/core/types";

/**
 * Verify cross-package import works by using the type.
 */
const _typeCheck: HolocronFile | undefined = undefined;
void _typeCheck;

export function meta() {
  return [
    { title: "Holocron" },
    { name: "description", content: "Personal file vault" },
  ];
}

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <h1>Holocron</h1>
      <p>Your personal file vault.</p>
    </main>
  );
}

