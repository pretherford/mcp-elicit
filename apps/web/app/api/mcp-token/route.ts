import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { auth } from "../../../auth";

export async function GET(_req: NextRequest) {
  // Auth bypass for local testing (set MCP_AUTH_TEST_BYPASS=true to bypass)
  const bypass = process.env.MCP_AUTH_TEST_BYPASS === "true";

  const session = await auth();
  if (!bypass && !session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = process.env.SHARED_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const token = await new SignJWT({
    name: session?.user?.name || "Test User",
    provider: "google"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session?.user?.email || "test@example.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token });
}
