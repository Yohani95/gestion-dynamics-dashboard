"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  House,
  LayoutDashboard,
  ArrowRightLeft,
  Menu,
  ChevronRight,
  Settings2,
  PlayCircle,
  Database,
  ChevronDown,
} from "lucide-react";
import {
  InstanceProvider,
  fetchWithInstance,
  useInstance,
} from "./InstanceContext";
import { AdminSessionProvider, useAdminSession } from "./AdminSessionContext";
import InstanceSelector from "./InstanceSelector";
import AdminSessionControl from "./AdminSessionControl";
import JobBrowserNotifications from "./JobBrowserNotifications";
import PwaInstallPrompt from "./PwaInstallPrompt";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const primaryNavItems: NavItem[] = [
  { name: "Inicio", href: "/", icon: House },
  { name: "Ventas (Dynamics)", href: "/ventas", icon: LayoutDashboard },
  { name: "Transferencias", href: "/transferencias", icon: ArrowRightLeft },
];

const advancedNavItems: NavItem[] = [
  { name: "Jobs", href: "/advanced/jobs", icon: PlayCircle },
  { name: "SP Activos", href: "/advanced/sps", icon: Database },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  const pageTitle =
    pathname === "/"
      ? "Panel Ejecutivo Integrado"
      : pathname.startsWith("/ventas")
        ? "Diagnostico Integracion Dynamics"
        : pathname.startsWith("/transferencias")
          ? "Gestion de Transferencias"
          : pathname.startsWith("/advanced/jobs")
            ? "Control SQL Agent Jobs"
            : pathname.startsWith("/advanced/sps")
              ? "Monitoreo de SP Activos"
              : pathname.startsWith("/advanced")
                ? "Modulo Avanzado"
                : "Gestion Dynamics Dashboard";

  const SidebarContent = ({ currentPath }: { currentPath: string }) => {
    const { instance, isJobsOnly, supportsTransferencias } = useInstance();
    const { authenticated, username, role, loading: sessionLoading } = useAdminSession();
    const isNavActiveLocal = (href: string) => {
      if (href === "/") return currentPath === "/";
      return currentPath === href || currentPath.startsWith(`${href}/`);
    };
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(
      currentPath.startsWith("/advanced"),
    );
    const [advancedAlerts, setAdvancedAlerts] = useState(0);
    const loadAlertsInFlightRef = useRef(false);

    useEffect(() => {
      if (currentPath.startsWith("/advanced")) {
        setIsAdvancedOpen(true);
      }
    }, [currentPath]);

    useEffect(() => {
      let isMounted = true;

      const loadAdvancedAlerts = async () => {
        if (!isMounted) return;
        if (document.visibilityState !== "visible") return;
        if (loadAlertsInFlightRef.current) return;

        loadAlertsInFlightRef.current = true;
        try {
          const response = await fetchWithInstance(
            "/api/advanced/alerts/summary",
            {},
            instance,
          );
          const json = (await response.json()) as {
            success?: boolean;
            failedJobs24h?: number;
            longRunningJobs?: number;
          };

          if (!response.ok || !json.success) {
            return;
          }

          if (isMounted) {
            const failed = Number(json.failedJobs24h ?? 0);
            const longRunning = Number(json.longRunningJobs ?? 0);
            setAdvancedAlerts(failed + longRunning);
          }
        } catch {
          // Silencio deliberado: no bloquea navegacion si falla el resumen.
        } finally {
          loadAlertsInFlightRef.current = false;
        }
      };

      void loadAdvancedAlerts();
      const intervalId = window.setInterval(() => {
        void loadAdvancedAlerts();
      }, 30_000);

      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          void loadAdvancedAlerts();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        isMounted = false;
        window.clearInterval(intervalId);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }, [instance]);

    const isAdvancedActive = currentPath.startsWith("/advanced");
    const visiblePrimaryNavItems = isJobsOnly
      ? []
      : primaryNavItems.filter((item) => {
          if (!supportsTransferencias && item.href === "/transferencias") {
            return false;
          }
          return true;
        });
    const visibleAdvancedNavItems = isJobsOnly
      ? advancedNavItems.filter((item) => item.href === "/advanced/jobs")
      : advancedNavItems;
    const advancedRootHref = visibleAdvancedNavItems[0]?.href ?? "/advanced/jobs";

    const normalizedUsername = username?.trim() ?? "";
    const displayName =
      authenticated && normalizedUsername.length > 0 ? normalizedUsername : "Invitado";
    const displayRole = authenticated
      ? role === "ADMIN"
        ? "Administrador"
        : (role ?? "Usuario")
      : (sessionLoading ? "Verificando sesion..." : "Sin sesion");

    const displayInitials = (() => {
      const words = displayName.split(/\s+/).filter(Boolean);
      if (words.length === 0) return "IN";
      if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
      return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
    })();

    return (
      <div className="flex h-full flex-col bg-zinc-950 text-white">
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-zinc-800 px-6">
          <AnimatePresence mode="wait">
            {!isDesktopCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="origin-left overflow-hidden whitespace-nowrap"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                    <span className="text-sm font-bold text-zinc-950">TL</span>
                  </div>
                  <span className="font-semibold tracking-wide">TheLineGroup</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isDesktopCollapsed && (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-white">
              <span className="text-sm font-bold text-zinc-950">TL</span>
            </div>
          )}
        </div>

        <nav className="scrollbar-hide flex-1 space-y-1 overflow-y-auto p-4">
          {visiblePrimaryNavItems.map((item) => {
            const isActive = isNavActiveLocal(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`group relative flex items-center overflow-hidden rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? "bg-zinc-800/80 text-white shadow-sm"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-50"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-white"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <item.icon
                  className={`h-5 w-5 flex-shrink-0 transition-colors ${
                    isActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                  } ${isDesktopCollapsed ? "mx-auto" : "mr-3"}`}
                  aria-hidden
                />
                <AnimatePresence mode="wait">
                  {!isDesktopCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}

          {isDesktopCollapsed ? (
            <Link
              href={advancedRootHref}
              onClick={() => setIsMobileOpen(false)}
              className={`group relative flex items-center justify-center overflow-hidden rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300 ${
                isAdvancedActive
                  ? "bg-zinc-800/80 text-white shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-50"
              }`}
            >
              {isAdvancedActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-white"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              {isJobsOnly ? (
                <PlayCircle
                  className={`h-5 w-5 transition-colors ${
                    isAdvancedActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  aria-hidden
                />
              ) : (
                <Settings2
                  className={`h-5 w-5 transition-colors ${
                    isAdvancedActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  aria-hidden
                />
              )}
              {advancedAlerts > 0 && (
                <span className="absolute right-2 top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                  {advancedAlerts > 99 ? "99+" : advancedAlerts}
                </span>
              )}
            </Link>
          ) : isJobsOnly ? (
            <Link
              href={advancedRootHref}
              onClick={() => setIsMobileOpen(false)}
              className={`group relative flex w-full items-center rounded-xl px-3 py-3 text-left text-sm font-medium transition-all duration-300 ${
                isAdvancedActive
                  ? "bg-zinc-800/80 text-white shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-50"
              }`}
            >
              {isAdvancedActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-white"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <PlayCircle
                className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                  isAdvancedActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
                aria-hidden
              />
              <span className="overflow-hidden whitespace-nowrap">Jobs SQL Agent</span>
              {advancedAlerts > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                  {advancedAlerts > 99 ? "99+" : advancedAlerts}
                </span>
              )}
            </Link>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen((prev) => !prev)}
                className={`group relative flex w-full items-center rounded-xl px-3 py-3 text-left text-sm font-medium transition-all duration-300 ${
                  isAdvancedActive
                    ? "bg-zinc-800/80 text-white shadow-sm"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-50"
                }`}
              >
                {isAdvancedActive && (
                  <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-white"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                <Settings2
                  className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                    isAdvancedActive
                      ? "text-white"
                      : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  aria-hidden="true"
                />
                <span className="overflow-hidden whitespace-nowrap">Avanzados</span>

                <div className="ml-auto flex items-center gap-2">
                  {advancedAlerts > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                      {advancedAlerts > 99 ? "99+" : advancedAlerts}
                    </span>
                  )}
                  <motion.div animate={{ rotate: isAdvancedOpen ? 180 : 0 }}>
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isAdvancedOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1 overflow-hidden pl-4"
                  >
                    {visibleAdvancedNavItems.map((item) => {
                      const isActive = isNavActiveLocal(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMobileOpen(false)}
                          className={`group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? "bg-zinc-800 text-white"
                              : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-50"
                          }`}
                        >
                          <item.icon
                            className={`mr-3 h-4 w-4 flex-shrink-0 ${
                              isActive
                                ? "text-white"
                                : "text-zinc-500 group-hover:text-zinc-300"
                            }`}
                            aria-hidden
                          />
                          <span className="overflow-hidden whitespace-nowrap">{item.name}</span>
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>

        <div className="border-t border-zinc-800 p-4">
          <div
            className={`rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-3 ${
              isDesktopCollapsed ? "justify-center" : ""
            } flex items-center gap-3`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-zinc-800 ${
                authenticated
                  ? "bg-gradient-to-tr from-zinc-700 to-zinc-600"
                  : "bg-gradient-to-tr from-zinc-600 to-zinc-500"
              }`}
            >
              {displayInitials}
            </div>
            <AnimatePresence mode="wait">
              {!isDesktopCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex flex-col overflow-hidden whitespace-nowrap"
                >
                  <span className="truncate text-sm font-medium text-zinc-200">{displayName}</span>
                  <span className="truncate text-xs text-zinc-500">{displayRole}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  };

  return (
    <InstanceProvider>
      <AdminSessionProvider>
        <div className="min-h-screen bg-zinc-50 font-sans selection:bg-zinc-900 selection:text-white">
        <AnimatePresence>
          {isMobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileOpen(false)}
                className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm lg:hidden"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl lg:hidden"
              >
                <SidebarContent currentPath={pathname} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <motion.div
          animate={{ width: isDesktopCollapsed ? "5rem" : "18rem" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="isolate hidden border-r border-zinc-200/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col"
        >
          <SidebarContent currentPath={pathname} />

          <button
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="absolute -right-3.5 top-1/2 z-[60] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-colors hover:text-zinc-900"
          >
            <motion.div animate={{ rotate: isDesktopCollapsed ? 180 : 0 }}>
              <ChevronRight className="h-4 w-4" />
            </motion.div>
          </button>
        </motion.div>

        <div
          className={`flex w-full flex-1 flex-col transition-all duration-300 lg:min-h-screen ${
            isDesktopCollapsed ? "lg:pl-20" : "lg:pl-72"
          }`}
        >
          <div className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-x-3 border-b border-zinc-200/50 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md sm:gap-x-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="-m-2.5 rounded-lg p-2.5 text-zinc-700 transition-colors hover:bg-zinc-100 lg:hidden"
              onClick={() => setIsMobileOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>

            <div className="h-6 w-px bg-zinc-200 lg:hidden" aria-hidden="true" />

            <div className="flex flex-1 flex-col gap-2 self-stretch sm:flex-row sm:items-center sm:gap-x-4 lg:gap-x-6">
              <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-800">{pageTitle}</h1>
              <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-auto sm:gap-x-4 lg:gap-x-6">
                <AdminSessionControl />
                <JobBrowserNotifications />
                <InstanceSelector />
              </div>
            </div>
          </div>

          <main className="flex-1 pb-10">
            <div className="mx-auto max-w-6xl animate-in px-4 py-8 fade-in slide-in-from-bottom-4 duration-500 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>

        <PwaInstallPrompt />
        </div>
      </AdminSessionProvider>
    </InstanceProvider>
  );
}
