import type { PropsWithChildren } from "react";
import Navbar from "./Navbar";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="border-b border-line/80 bg-paper/90 backdrop-blur">
        <header className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cinnabar">
              OpenClaw Math Review
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              考研数学错题复习
            </h1>
          </div>
          <Navbar />
        </header>
      </div>
      <main className="mx-auto max-w-7xl px-5 py-7 lg:px-8">{children}</main>
    </div>
  );
}
