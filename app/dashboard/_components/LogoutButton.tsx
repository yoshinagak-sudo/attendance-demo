"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { dashboardLogoutAction } from "../login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="dash-nav-logout"
      disabled={pending}
      aria-busy={pending}
    >
      <LogOut size={15} aria-hidden="true" />
      {pending ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}

export function LogoutButton() {
  return (
    <form action={dashboardLogoutAction}>
      <SubmitButton />
    </form>
  );
}
