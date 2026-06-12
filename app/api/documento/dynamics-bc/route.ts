import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { buscarDocumentoEnOData, isDynamicsODataConfigured } from "@/lib/dynamicsOData";

export const dynamic = "force-dynamic";

type DocRow = {
  Tipo: string;
  Numero: number;
  Cod_Empresa: string;
};

export async function GET(request: NextRequest) {
  const instance = request.headers.get("x-instance") || "default";
  const numero = request.nextUrl.searchParams.get("numero")?.trim();
  const tipo = request.nextUrl.searchParams.get("tipo")?.trim().toUpperCase() || null;
  const empresa = request.nextUrl.searchParams.get("empresa")?.trim() || null;

  if (!numero) {
    return NextResponse.json({ error: "Falta el parámetro numero." }, { status: 400 });
  }

  if (!isDynamicsODataConfigured()) {
    return NextResponse.json(
      { error: "Business Central no está configurado en el servidor." },
      { status: 503 },
    );
  }

  try {
    const docs = await query<DocRow[]>(
      `
        SELECT Tipo, Numero, Cod_Empresa FROM (
          SELECT 'BLE' AS Tipo, Cab.Nro_Impreso AS Numero, Cab.Cod_Empresa
          FROM Ges_BlvCabecera Cab WITH (NOLOCK)
          WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
          UNION ALL
          SELECT 'FCV', Cab.Nro_Impreso, Cab.Cod_Empresa
          FROM Ges_FcvCabecera Cab WITH (NOLOCK)
          WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
          UNION ALL
          SELECT 'NCV', Cab.Nro_Impreso, Cab.Cod_Empresa
          FROM Ges_NcvCabecera Cab WITH (NOLOCK)
          WHERE Cab.Nro_Impreso = TRY_CAST(@numero AS INT) OR CONVERT(NVARCHAR(20), Cab.Nro_Impreso) = @numero
        ) U
        WHERE (@tipo IS NULL OR @tipo = '' OR Tipo = @tipo)
          AND (@empresa IS NULL OR @empresa = '' OR Cod_Empresa = CAST(NULLIF(@empresa, '') AS UNIQUEIDENTIFIER))
        ORDER BY Tipo ASC
      `,
      { numero, tipo, empresa },
      instance,
    );

    const doc = docs?.[0];
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado en Gestión." }, { status: 404 });
    }

    const resultado = await buscarDocumentoEnOData(
      String(doc.Numero),
      doc.Tipo,
      doc.Cod_Empresa,
      instance,
    );

    return NextResponse.json({ dynamicsBc: resultado });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[API documento/dynamics-bc]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
