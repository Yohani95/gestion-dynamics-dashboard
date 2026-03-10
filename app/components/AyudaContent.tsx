"use client";

export default function AyudaContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 text-slate-800">
      <h2 className="text-xl font-semibold text-slate-900">Ayuda — Dashboard Dynamics</h2>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Documento</h3>
        <p className="text-sm text-slate-700 mb-2">
          Consulta un documento por su número (BLE, FCV o NCV). Verás el estado en SII, envío a Dynamics,
          número de líneas en Gestion, detalle por línea y errores registrados. El <strong>último log Dynamics</strong> indica
          el estado más reciente del documento por si ya fue corregido.
        </p>
        <p className="text-sm text-slate-700">
          Si el documento está <strong>timbrado (SII)</strong>, puedes usar <strong>Reprocesar</strong> para
          volver a enviarlo. También puedes ejecutar <strong>Localizar</strong> (PASO 3: actualizar localización en Dynamics)
          y <strong>Registrar</strong> (PASO 4: contabilizar en Dynamics) para el documento consultado; se usan la empresa y fecha del documento. Los valores que ingreses y la pestaña activa se conservan al cambiar de sección.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Resumen por estados</h3>
        <p className="text-sm text-slate-700 mb-2">
          Agrupa documentos por empresa, fecha, tipo (BLE/FCV/NCV) y estado de envío a Dynamics. Indica
          <strong> fecha desde</strong> y marca los estados que quieras ver (0 a 4). Opcionalmente filtra por empresa.
        </p>
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
          <li><strong>0</strong> — Sin enviar</li>
          <li><strong>1</strong> — Enviada (pendiente localización)</li>
          <li><strong>2</strong> — Localización OK (pendiente registro)</li>
          <li><strong>3</strong> — Registrado en Dynamics</li>
          <li><strong>4</strong> — Medio de pago listo</li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Documentos por fecha</h3>
        <p className="text-sm text-slate-700 mb-2">
          Lista todos los documentos de una fecha. Puedes filtrar por <strong>número de documento</strong> (parcial o exacto),
          empresa y tipo. Usa <strong>Ver detalle</strong> en cada fila para abrir el popup con el resumen del documento y,
          si aplica, reprocesar. La paginación y los filtros se recuerdan al cambiar de pestaña.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Reportería</h3>
        <p className="text-sm text-slate-700 mb-2">
          En las pestañas con datos puedes <strong>Exportar CSV</strong> e <strong>Imprimir</strong>:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
          <li><strong>Documento:</strong> al consultar un documento, aparecen botones para exportar su detalle a CSV o imprimir el resultado.</li>
          <li><strong>Resumen por estados:</strong> exporta la tabla actual a CSV (empresa, fecha, tipo, estado, cantidad) o imprime solo esa tabla.</li>
          <li><strong>Documentos por fecha:</strong> exporta los documentos visibles en la página (tras filtros) a CSV o imprime la tabla.</li>
        </ul>
        <p className="text-sm text-slate-700 mt-2">
          Los CSV se descargan en UTF-8 (abren bien en Excel). Al imprimir, solo se imprime el bloque de la pestaña actual.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Persistencia</h3>
        <p className="text-sm text-slate-700">
          La pestaña activa, el número de documento consultado, la fecha y filtros de la lista, y los filtros del resumen
          se guardan en la sesión del navegador. Al volver a cada pestaña, verás los últimos valores usados sin tener que
          volver a consultar (aunque puedes ejecutar de nuevo la búsqueda cuando quieras).
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Errores y reproceso</h3>
        <p className="text-sm text-slate-700">
          Los errores de envío a Dynamics se registran en <strong>Ges_Salida_Error_Dyn</strong>. En la consulta por documento
          se muestra el último log en Dynamics (estado y fecha) para comprobar si el documento ya está bien. Solo se puede
          reprocesar cuando el documento está timbrado en SII (estado 2).
        </p>
      </section>
    </div>
  );
}
