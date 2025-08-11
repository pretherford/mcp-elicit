import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { auth } from "../../../auth";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = process.env.SHARED_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const token = await new SignJWT({
    name: session.user.name || "",
    provider: "google"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.email)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token });
}
