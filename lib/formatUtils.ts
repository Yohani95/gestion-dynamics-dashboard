/**
 * Formatea una fecha de SQL Server para mostrarla exactamente como está en la base de datos,
 * evitando desfases de zona horaria (UTC offsets).
 */
export const formatDateLocal = (dateInput: string | Date | null | undefined) => {
    if (!dateInput) return "-";

    let date: Date;

    if (typeof dateInput === 'string') {
        // SQL Server suele enviar: 2026-03-10T12:00:00.000Z o 2026-03-10 12:00:00
        // Eliminamos la 'Z' y reemplazamos espacio por 'T' para forzar interpretación LOCAL
        const cleanStr = dateInput.replace("Z", "").replace(" ", "T");
        date = new Date(cleanStr);
    } else {
        date = dateInput;
    }

    // Verificamos si la fecha es válida
    if (isNaN(date.getTime())) return String(dateInput);

    return date.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
};
