"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-800"
    >
      Sign out
    </button>
  );
}
