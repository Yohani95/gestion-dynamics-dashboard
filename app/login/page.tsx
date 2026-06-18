"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { AdminSessionProvider, useAdminSession } from "../components/AdminSessionContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, authenticated, provider, error, login } = useAdminSession();
  const [form, setForm] = useState({ username: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirect") || "/";

  useEffect(() => {
    if (!loading && authenticated) {
      router.replace(redirectTo);
    }
  }, [authenticated, loading, redirectTo, router]);

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

      router.replace(redirectTo);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm font-medium text-zinc-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verificando sesion...
        </div>
      </div>
    );
  }

  if (provider === "windows") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-2xl"
        >
          <ShieldCheck className="mx-auto h-10 w-10 text-zinc-300" />
          <h1 className="mt-4 text-xl font-bold text-white">Autenticacion Windows</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Este entorno usa autenticacion integrada de IIS/Active Directory. Accede desde el
            servidor corporativo con tu cuenta de dominio.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
            <span className="text-sm font-bold text-zinc-950">TL</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              TheLineGroup
            </p>
            <h1 className="text-lg font-bold text-white">Iniciar sesion</h1>
          </div>
        </div>

        <p className="mb-5 text-sm text-zinc-400">
          Ingresa tus credenciales para acceder al panel de gestion Dynamics.
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
            >
              Usuario
            </label>
            <input
              id="username"
              type="text"
              value={form.username}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, username: event.target.value }))
              }
              autoComplete="username"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none ring-white/10 transition focus:ring-2"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
            >
              Clave
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none ring-white/10 transition focus:ring-2"
            />
          </div>

          {(formError || error) && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300">
              {formError ?? error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
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
  );
}

export default function LoginPage() {
  return (
    <AdminSessionProvider>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm font-medium text-zinc-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando...
            </div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AdminSessionProvider>
  );
}
