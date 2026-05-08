import type { PropsWithChildren } from "react";
import Navbar from "./Navbar";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen text-ink">
      <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
        <div className="apple-nav-glass mx-auto max-w-7xl rounded-[28px]">
          <header className="flex min-h-[4.5rem] flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between lg:px-7">
            <div className="flex items-center gap-3">
              <img
                src="/logo.svg"
                alt="MathLoop logo"
                className="h-9 w-9 rounded-[12px] border border-white/60 bg-white/50 object-cover shadow-[0_8px_24px_rgba(29,29,31,0.08),inset_0_1px_0_rgba(255,255,255,0.72)]"
              />
              <div>
                <h1 className="text-[1.05rem] font-semibold leading-tight tracking-[-0.28px] text-ink">
                  MathLoop
                </h1>
                <p className="mt-0.5 text-xs font-normal tracking-[-0.12px] text-ink/45">
                  Smart review for math mistakes
                </p>
              </div>
            </div>
            <Navbar />
          </header>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-5 pb-16 pt-32 lg:px-8">{children}</main>
    </div>
  );
}
