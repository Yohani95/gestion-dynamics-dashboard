"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Loader2, LogIn, LogOut, ShieldCheck, X } from "lucide-react";
import { useAdminSession } from "./AdminSessionContext";

export default function AdminSessionControl() {
  const { loading, isAdmin, username, provider, error, login, logout } = useAdminSession();
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const providerLabel = useMemo(
    () => (provider === "windows" ? "Windows Auth" : "Sesion local"),
    [provider],
  );

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const result = await login(form.username, form.password);
      if (!result.success) {
        setFormError(result.error ?? "No fue posible iniciar sesion.");
        return;
      }

      setOpen(false);
      setForm({ username: "", password: "" });
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
    setFormError(null);
  };

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando sesion...
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="inline-flex items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden md:inline">Admin: {username}</span>
          <span className="md:hidden">Admin</span>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
          title="Cerrar sesion de administrador"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar sesion</span>
        </button>
      </div>
    );
  }

  if (provider === "windows") {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">
        <ShieldCheck className="h-4 w-4" />
        Auth Windows pendiente (IIS/AD)
      </div>
    );
  }

  const modalNode =
    isMounted && open
      ? createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] overflow-y-auto bg-zinc-950/45 p-3 backdrop-blur-sm sm:p-5"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeModal();
                }
              }}
            >
              <div className="flex min-h-full items-start justify-center py-8 sm:items-center sm:py-0">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Seguridad
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-zinc-900">
                        Sesion de administrador
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">{providerLabel}</p>
                    </div>

                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={submitting}
                      className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <form className="mt-4 space-y-3" onSubmit={onSubmit}>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Usuario
                    </label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      autoComplete="username"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/20 transition focus:ring-2"
                    />

                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Clave
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      autoComplete="current-password"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-indigo-500/20 transition focus:ring-2"
                    />

                    {(formError || error) && (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        {formError ?? error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validando...
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          Iniciar sesion
                        </>
                      )}
                    </button>
                  </form>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
        title="Iniciar sesion administrador"
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Iniciar sesion admin</span>
      </button>

      {modalNode}
    </>
  );
}
