"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  House,
  LayoutDashboard,
  ArrowRightLeft,
  Menu,
  ChevronRight,
} from "lucide-react";
import { InstanceProvider } from "./InstanceContext";
import InstanceSelector from "./InstanceSelector";
import PwaInstallPrompt from "./PwaInstallPrompt";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  const navItems = [
    { name: "Inicio", href: "/", icon: House },
    { name: "Ventas (Dynamics)", href: "/ventas", icon: LayoutDashboard },
    { name: "Transferencias", href: "/transferencias", icon: ArrowRightLeft },
  ];

  const isNavActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const pageTitle =
    pathname === "/"
      ? "Panel Ejecutivo Integrado"
      : pathname.startsWith("/ventas")
        ? "Diagnostico Integracion Dynamics"
        : pathname.startsWith("/transferencias")
          ? "Gestion de Transferencias"
          : "Gestion Dynamics Dashboard";

  const SidebarContent = () => (
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
        {navItems.map((item) => {
          const isActive = isNavActive(item.href);
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
                aria-hidden="true"
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
      </nav>

      <div className="border-t border-zinc-800 p-4">
        <div
          className={`rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-3 ${
            isDesktopCollapsed ? "justify-center" : ""
          } flex items-center gap-3`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 text-xs font-bold ring-2 ring-zinc-800">
            YE
          </div>
          <AnimatePresence mode="wait">
            {!isDesktopCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="flex flex-col overflow-hidden whitespace-nowrap"
              >
                <span className="text-sm font-medium text-zinc-200">
                  Yohani Espinoza
                </span>
                <span className="text-xs text-zinc-500">Administrador</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <InstanceProvider>
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
                <SidebarContent />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <motion.div
          animate={{ width: isDesktopCollapsed ? "5rem" : "18rem" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="isolate hidden border-r border-zinc-200/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col"
        >
          <SidebarContent />

          <button
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="absolute -right-3.5 top-1/2 z-[60] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition-colors hover:text-zinc-900"
          >
            <motion.div animate={{ rotate: isDesktopCollapsed ? 180 : 0 }}>
              <ChevronRight className="h-4 w-4" />
            </motion.div>
          </button>
        </motion.div>

        <motion.div
          animate={{ paddingLeft: isDesktopCollapsed ? "5rem" : "18rem" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="flex w-full flex-1 flex-col transition-all lg:min-h-screen"
        >
          <div className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-x-4 border-b border-zinc-200/50 bg-white/80 px-4 shadow-sm backdrop-blur-md sm:gap-x-6 sm:px-6 lg:px-8">
            <button
              type="button"
              className="-m-2.5 rounded-lg p-2.5 text-zinc-700 transition-colors hover:bg-zinc-100 lg:hidden"
              onClick={() => setIsMobileOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>

            <div className="h-6 w-px bg-zinc-200 lg:hidden" aria-hidden="true" />

            <div className="flex flex-1 items-center gap-x-4 self-stretch lg:gap-x-6">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-800">
                {pageTitle}
              </h1>
              <div className="ml-auto flex items-center gap-x-4 lg:gap-x-6">
                <InstanceSelector />
              </div>
            </div>
          </div>

          <main className="flex-1 pb-10">
            <div className="mx-auto max-w-6xl animate-in px-4 py-8 fade-in slide-in-from-bottom-4 duration-500 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </motion.div>

        <PwaInstallPrompt />
      </div>
    </InstanceProvider>
  );
}
