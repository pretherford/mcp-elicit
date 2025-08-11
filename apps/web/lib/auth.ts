import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { getServerSession } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        (token as any).provider = "google";
        (token as any).picture = (profile as any)?.picture;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).picture = (token as any).picture;
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};

export function getSession() {
  return getServerSession(authOptions);
}
