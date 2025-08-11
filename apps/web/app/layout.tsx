import "./globals.css";
import Link from "next/link";
import { auth } from "../auth";
import Providers from "./providers";

export const metadata = {
  title: "MCP Elicitation Demo",
  description: "Demo app that shows MCP server elicitations with Google OAuth."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAuthed = !!session?.user?.email;

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <Providers session={session}>
          <header className="border-b border-gray-200">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <div className="font-semibold">MCP Elicitation Demo</div>
              <nav>
                {isAuthed ? (
                  <form action="/api/auth/signout" method="post">
                    <button type="submit" className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-800">
                      Sign out
                    </button>
                  </form>
                ) : (
                  <Link
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-500"
                    href="/api/auth/signin"
                  >
                    Sign in with Google
                  </Link>
                )}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
