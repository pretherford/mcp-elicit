import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
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
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
