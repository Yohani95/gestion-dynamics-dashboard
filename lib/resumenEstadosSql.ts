import { sqlCategoriaCase } from "@/lib/resumenCategorias";

const filtroEmpresa =
  "AND (NULLIF(RTRIM(@empresa), '') IS NULL OR Cab.Cod_Empresa = CAST(NULLIF(RTRIM(@empresa), '') AS UNIQUEIDENTIFIER))";

/** Consulta rápida agregada por estado (sin subcategorías). */
export function buildResumenEstadosSqlRapido(filtroHasta: string): string {
  return `
    WITH EstDyn AS (
      SELECT Id_Documento, MIN(Estado) AS Estado
      FROM Ges_EstadoEnvioDynamics WITH (NOLOCK)
      GROUP BY Id_Documento
    )
    SELECT Descripcion, Fecha, Cod_Empresa, Tipo, Estado, Cantidad FROM (
      SELECT emp.Descripcion,
             CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23) AS Fecha,
             Cab.Cod_Empresa,
             'BLE' AS Tipo,
             ISNULL(L.Estado, 0) AS Estado,
             COUNT(*) AS Cantidad
      FROM Ges_BlvCabecera Cab WITH (NOLOCK)
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
      LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Boleta
      WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
        ${filtroHasta}
        ${filtroEmpresa}
        AND CHARINDEX(',' + CAST(ISNULL(L.Estado, 0) AS VARCHAR(5)) + ',', ',' + @estados + ',') > 0
      GROUP BY ISNULL(L.Estado, 0), emp.Descripcion,
               CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23), Cab.Cod_Empresa
      UNION ALL
      SELECT emp.Descripcion,
             CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
             Cab.Cod_Empresa, 'FCV',
             ISNULL(L.Estado, 0), COUNT(*)
      FROM Ges_FcvCabecera Cab WITH (NOLOCK)
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
      LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Factura
      WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
        ${filtroHasta}
        ${filtroEmpresa}
        AND CHARINDEX(',' + CAST(ISNULL(L.Estado, 0) AS VARCHAR(5)) + ',', ',' + @estados + ',') > 0
      GROUP BY ISNULL(L.Estado, 0), emp.Descripcion,
               CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23), Cab.Cod_Empresa
      UNION ALL
      SELECT emp.Descripcion,
             CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
             Cab.Cod_Empresa, 'NCV',
             ISNULL(L.Estado, 0), COUNT(*)
      FROM Ges_NcvCabecera Cab WITH (NOLOCK)
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
      LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_NotaCredito
      WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
        ${filtroHasta}
        ${filtroEmpresa}
        AND CHARINDEX(',' + CAST(ISNULL(L.Estado, 0) AS VARCHAR(5)) + ',', ',' + @estados + ',') > 0
      GROUP BY ISNULL(L.Estado, 0), emp.Descripcion,
               CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23), Cab.Cod_Empresa
    ) U
    ORDER BY Descripcion, Fecha, Tipo, Estado
  `;
}

/**
 * Estado 2 con subcategorías (inventario / diferencia / registro).
 * Solo errores del periodo y solo documentos estado 2 del rango.
 */
export function buildResumenEstadosSqlEstado2(filtroHasta: string): string {
  const categoriaCase = sqlCategoriaCase(
    "2",
    "ISNULL(err.ErrText, '')",
    "u.Lineas_Gestion",
    "u.Lineas_Dynamics_OK",
  );

  return `
    WITH EstDyn AS (
      SELECT Id_Documento, MIN(Estado) AS Estado
      FROM Ges_EstadoEnvioDynamics WITH (NOLOCK)
      GROUP BY Id_Documento
    ),
    U2 AS (
      SELECT emp.Descripcion,
             CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23) AS Fecha,
             Cab.Cod_Empresa,
             'BLE' AS Tipo,
             Cab.Nro_Impreso AS Numero,
             ISNULL(Det.Cnt, 0) AS Lineas_Gestion,
             ISNULL(DetSync.Cnt, 0) AS Lineas_Dynamics_OK
      FROM Ges_BlvCabecera Cab WITH (NOLOCK)
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
      LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Boleta
      LEFT JOIN (
        SELECT Id_Boleta, COUNT(*) AS Cnt
        FROM Ges_BlvDetalle WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(ISNULL(Tipo_Movimiento, '')))) <> 'C'
        GROUP BY Id_Boleta
      ) Det ON Det.Id_Boleta = Cab.Id_Boleta
      LEFT JOIN (
        SELECT D.Id_Boleta, COUNT(*) AS Cnt
        FROM Ges_BlvDetalle D WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(ISNULL(D.Tipo_Movimiento, '')))) <> 'C'
          AND EXISTS (
            SELECT 1
            FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
            WHERE E.Id_Documento = D.Id_Boleta
              AND E.Id_Documento_Detalle = D.Id_DetalleBoleta
              AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
          )
        GROUP BY D.Id_Boleta
      ) DetSync ON DetSync.Id_Boleta = Cab.Id_Boleta
      WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
        ${filtroHasta}
        ${filtroEmpresa}
        AND ISNULL(L.Estado, 0) = 2
      UNION ALL
      SELECT emp.Descripcion,
             CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
             Cab.Cod_Empresa, 'FCV', Cab.Nro_Impreso,
             ISNULL(Det.Cnt, 0), ISNULL(DetSync.Cnt, 0)
      FROM Ges_FcvCabecera Cab WITH (NOLOCK)
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
      LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_Factura
      LEFT JOIN (SELECT Id_Factura, COUNT(*) AS Cnt FROM Ges_FcvDetalle WITH (NOLOCK) GROUP BY Id_Factura) Det ON Det.Id_Factura = Cab.Id_Factura
      LEFT JOIN (
        SELECT D.Id_Factura, COUNT(*) AS Cnt
        FROM Ges_FcvDetalle D WITH (NOLOCK)
        WHERE EXISTS (
          SELECT 1
          FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          WHERE E.Id_Documento = D.Id_Factura
            AND E.Id_Documento_Detalle = D.Id_DetalleFactura
            AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
        )
        GROUP BY D.Id_Factura
      ) DetSync ON DetSync.Id_Factura = Cab.Id_Factura
      WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
        ${filtroHasta}
        ${filtroEmpresa}
        AND ISNULL(L.Estado, 0) = 2
      UNION ALL
      SELECT emp.Descripcion,
             CONVERT(VARCHAR(10), CONVERT(DATE, Cab.Fecha_Emision), 23),
             Cab.Cod_Empresa, 'NCV', Cab.Nro_Impreso,
             ISNULL(Det.Cnt, 0), ISNULL(DetSync.Cnt, 0)
      FROM Ges_NcvCabecera Cab WITH (NOLOCK)
      INNER JOIN Ges_Empresas Emp WITH (NOLOCK) ON Emp.Cod_Empresa = Cab.Cod_Empresa
      LEFT JOIN EstDyn L ON L.Id_Documento = Cab.Id_NotaCredito
      LEFT JOIN (SELECT Id_NotaCredito, COUNT(*) AS Cnt FROM Ges_NcvDetalle WITH (NOLOCK) GROUP BY Id_NotaCredito) Det ON Det.Id_NotaCredito = Cab.Id_NotaCredito
      LEFT JOIN (
        SELECT D.Id_NotaCredito, COUNT(*) AS Cnt
        FROM Ges_NcvDetalle D WITH (NOLOCK)
        WHERE EXISTS (
          SELECT 1
          FROM Ges_EstadoEnvioDynamics E WITH (NOLOCK)
          WHERE E.Id_Documento = D.Id_NotaCredito
            AND E.Id_Documento_Detalle = D.Id_DetalleNotaCredito
            AND NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), E.Id_Documento_Dynamics))), '') IS NOT NULL
        )
        GROUP BY D.Id_NotaCredito
      ) DetSync ON DetSync.Id_NotaCredito = Cab.Id_NotaCredito
      WHERE CONVERT(DATE, Cab.Fecha_Emision) >= CAST(@fechaDesde AS DATE)
        ${filtroHasta}
        ${filtroEmpresa}
        AND ISNULL(L.Estado, 0) = 2
    ),
    Ids AS (
      SELECT DISTINCT Tipo, Numero FROM U2
    ),
    ErrRanked AS (
      SELECT
        d.Tipo,
        d.Numero,
        CONCAT(ISNULL(e.Mensaje, ''), ' ', ISNULL(CONVERT(NVARCHAR(4000), e.Error), '')) AS ErrText,
        ROW_NUMBER() OVER (PARTITION BY d.Tipo, d.Numero ORDER BY e.Fecha DESC) AS rn
      FROM Ids d
      INNER JOIN Ges_Salida_Error_Dyn e WITH (NOLOCK)
        ON RTRIM(ISNULL(e.Tipo, '')) = d.Tipo
        AND CONVERT(NVARCHAR(30), e.Numero) = CONVERT(NVARCHAR(30), d.Numero)
        AND e.Fecha >= CAST(@fechaDesde AS DATE)
    ),
    ErrLast AS (
      SELECT Tipo, Numero, ErrText FROM ErrRanked WHERE rn = 1
    ),
    DocsCat AS (
      SELECT
        u.Descripcion,
        u.Fecha,
        u.Cod_Empresa,
        u.Tipo,
        2 AS Estado,
        ${categoriaCase} AS Categoria,
        u.Lineas_Gestion,
        u.Lineas_Dynamics_OK
      FROM U2 u
      LEFT JOIN ErrLast err ON err.Tipo = u.Tipo AND err.Numero = u.Numero
    )
    SELECT Descripcion, Fecha, Cod_Empresa, Tipo, Estado, Categoria, COUNT(*) AS Cantidad
    FROM DocsCat
    GROUP BY Descripcion, Fecha, Cod_Empresa, Tipo, Estado, Categoria
    ORDER BY Descripcion, Fecha, Tipo, Categoria
  `;
}

export function buildResumenEstadosSql(filtroHasta: string): string {
  return buildResumenEstadosSqlRapido(filtroHasta);
}
