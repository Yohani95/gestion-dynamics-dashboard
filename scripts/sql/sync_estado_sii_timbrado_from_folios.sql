/*
  Sincroniza Estado_SII = 2 (Timbrado) en Ges_EleDocSii para folios confirmados en Folder.

  IMPORTANTE:
  - Este script NO consulta la API de Folder.
  - Debes cargar en @FoliosConfirmados los folios que ya verificaste como "facturados/timbrados" en Folder.
  - Incluye modo preview y modo apply para ejecutar de forma segura.
*/

SET NOCOUNT ON;

DECLARE @ApplyChanges BIT = 0; -- 0 = preview (no actualiza), 1 = aplica UPDATE

DECLARE @FoliosConfirmados TABLE (
  Nro_Impreso NVARCHAR(20) NOT NULL PRIMARY KEY
);

/* =======================================================================
   CARGA AQUI TUS FOLIOS CONFIRMADOS EN FOLDER
   Ejemplo:
   INSERT INTO @FoliosConfirmados (Nro_Impreso)
   VALUES (N'21364'), (N'21366');
   ======================================================================= */
INSERT INTO @FoliosConfirmados (Nro_Impreso)
VALUES
  (N'21364'),
  (N'21366');

IF NOT EXISTS (SELECT 1 FROM @FoliosConfirmados)
BEGIN
  THROW 50001, 'No hay folios cargados en @FoliosConfirmados.', 1;
END;

IF OBJECT_ID('tempdb..#Targets') IS NOT NULL DROP TABLE #Targets;

SELECT
  S.Id_Documento,
  CONVERT(NVARCHAR(20), S.Nro_Impreso) AS Nro_Impreso,
  S.Estado AS EstadoActual
INTO #Targets
FROM dbo.Ges_EleDocSii S WITH (NOLOCK)
INNER JOIN @FoliosConfirmados F
  ON CONVERT(NVARCHAR(20), S.Nro_Impreso) = F.Nro_Impreso;

/* Preview inicial */
SELECT
  'PREVIEW_BEFORE' AS Stage,
  T.Nro_Impreso,
  T.Id_Documento,
  T.EstadoActual
FROM #Targets T
ORDER BY TRY_CAST(T.Nro_Impreso AS BIGINT), T.Nro_Impreso;

IF @ApplyChanges = 0
BEGIN
  SELECT
    COUNT(*) AS TotalCoincidencias,
    SUM(CASE WHEN ISNULL(EstadoActual, -1) <> 2 THEN 1 ELSE 0 END) AS PendientesDeActualizar,
    SUM(CASE WHEN EstadoActual = 2 THEN 1 ELSE 0 END) AS YaTimbrados
  FROM #Targets;

  PRINT 'Modo preview finalizado. Cambia @ApplyChanges = 1 para aplicar UPDATE.';
  RETURN;
END;

BEGIN TRANSACTION;

UPDATE S
SET S.Estado = 2
FROM dbo.Ges_EleDocSii S
INNER JOIN #Targets T
  ON T.Id_Documento = S.Id_Documento
WHERE ISNULL(S.Estado, -1) <> 2;

DECLARE @RowsUpdated INT = @@ROWCOUNT;

/* Resultado final */
SELECT
  'PREVIEW_AFTER' AS Stage,
  CONVERT(NVARCHAR(20), S.Nro_Impreso) AS Nro_Impreso,
  S.Id_Documento,
  S.Estado AS EstadoActual
FROM dbo.Ges_EleDocSii S WITH (NOLOCK)
INNER JOIN @FoliosConfirmados F
  ON CONVERT(NVARCHAR(20), S.Nro_Impreso) = F.Nro_Impreso
ORDER BY TRY_CAST(CONVERT(NVARCHAR(20), S.Nro_Impreso) AS BIGINT), CONVERT(NVARCHAR(20), S.Nro_Impreso);

COMMIT TRANSACTION;

SELECT @RowsUpdated AS RowsUpdatedToEstado2;
