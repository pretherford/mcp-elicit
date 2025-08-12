import "./globals.css";
import Link from "next/link";
import { auth } from "../auth";
import Providers from "./providers";
import SignOutButton from "./components/SignOutButton";

export const metadata = {
  title: "MCP Elicitation Demo",
  description: "Demo app that shows MCP server elicitations with Google OAuth."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAuthed = !!session?.user?.email;

  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900">
        <Providers session={session}>
          <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <div className="text-base font-semibold tracking-tight text-gray-900">MCP Elicitation Demo</div>
              <nav className="flex items-center gap-3">
                {isAuthed ? (
                  <SignOutButton />
                ) : (
                  <Link
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    href="/api/auth/signin"
                  >
                    Sign in with Google
                  </Link>
                )}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
          <footer className="mt-10 border-t border-gray-200/80 bg-white/50 py-6 backdrop-blur">
            <div className="mx-auto max-w-5xl px-4 text-xs text-gray-500">
              <span>© {new Date().getFullYear()} MCP Elicitation Demo</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
