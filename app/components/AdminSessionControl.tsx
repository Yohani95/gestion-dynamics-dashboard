"use client";

import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAdminSession } from "./AdminSessionContext";

export default function AdminSessionControl() {
  const { loading, isAdmin, username, logout } = useAdminSession();

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando sesion...
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
        <ShieldCheck className="h-4 w-4" />
        <span className="hidden md:inline">{username}</span>
        <span className="md:hidden">Sesion</span>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
        title="Cerrar sesion"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Cerrar sesion</span>
      </button>
    </div>
  );
}
