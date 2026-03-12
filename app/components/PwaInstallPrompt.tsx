"use client";

import { useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7;

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

function detectIOS() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function detectSafari() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);
}

function canDisplayPrompt(installed: boolean) {
  const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
  const isDismissed = Date.now() - dismissedAt < DISMISS_MS;
  return !installed && !isDismissed;
}

export default function PwaInstallPrompt() {
  const [isReady, setIsReady] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [canShow, setCanShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const initializeId = window.setTimeout(() => {
      const installed = isStandaloneMode();
      setIsInstalled(installed);
      setCanShow(canDisplayPrompt(installed));
      setIsIOS(detectIOS());
      setIsSafari(detectSafari());
      setIsReady(true);
    }, 0);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent fail: install prompt still works without cache strategies.
      });
    }

    const mediaQuery = window.matchMedia("(display-mode: standalone)");

    const handleDisplayModeChange = () => {
      const installed = isStandaloneMode();
      setIsInstalled(installed);
      setCanShow(canDisplayPrompt(installed));
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanShow(false);
      setDeferredPrompt(null);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    mediaQuery.addEventListener("change", handleDisplayModeChange);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.clearTimeout(initializeId);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const showIOSHelp = useMemo(
    () => !isInstalled && isIOS && isSafari && canShow,
    [canShow, isIOS, isInstalled, isSafari],
  );

  const showInstallButton = useMemo(
    () => !isInstalled && deferredPrompt !== null && canShow,
    [canShow, deferredPrompt, isInstalled],
  );

  const showGenericHelp = useMemo(
    () => !isInstalled && !isIOS && canShow,
    [canShow, isIOS, isInstalled],
  );

  const dismissPrompt = () => {
    window.localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setCanShow(false);
  };

  const installApp = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    setIsInstalling(false);
    setDeferredPrompt(null);

    if (choice.outcome === "accepted") {
      setCanShow(false);
    }
  };

  if (!isReady || (!showInstallButton && !showIOSHelp && !showGenericHelp)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
      <p className="text-sm font-semibold text-zinc-900">Instala esta app</p>
      <p className="mt-1 text-sm text-zinc-600">
        {showInstallButton
          ? "Instalala para abrirla mas rapido y usarla como aplicacion nativa."
          : showIOSHelp
            ? "Para instalarla en iPhone/iPad: abre Compartir y elige Anadir a pantalla de inicio."
            : "Si no aparece el boton de instalar, abre el menu del navegador y elige Instalar aplicacion."}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {showInstallButton && (
          <button
            type="button"
            onClick={() => void installApp()}
            disabled={isInstalling}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInstalling ? "Instalando..." : "Instalar"}
          </button>
        )}
        <button
          type="button"
          onClick={dismissPrompt}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Recordar luego
        </button>
      </div>
    </div>
  );
}
