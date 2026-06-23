import HerramientasVentasContent from "../../components/HerramientasVentasContent";

export default function VentasHerramientasPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Herramientas BC</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Auditoría masiva contra Business Central y reproceso por Excel. Uso operativo avanzado.
        </p>
      </header>

      <div className="bg-white ring-1 ring-zinc-200/50 rounded-2xl shadow-sm p-6 sm:p-8">
        <HerramientasVentasContent />
      </div>
    </div>
  );
}
