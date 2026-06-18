import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesion | Diagnostico Dynamics",
  description: "Acceso seguro al panel de gestion Dynamics.",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
