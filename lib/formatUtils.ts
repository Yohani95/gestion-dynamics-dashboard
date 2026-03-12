/**
 * Formatea una fecha de SQL Server para mostrarla exactamente como está en la base de datos,
 * evitando desfases de zona horaria (UTC offsets).
 */
export const formatDateLocal = (dateInput: string | Date | null | undefined) => {
    if (!dateInput) return "-";

    // Si es un string de solo fecha (YYYY-MM-DD), lo retornamos formateado directamente
    // para evitar que el objeto Date lo convierta a UTC y lo mueva de día.
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        const [year, month, day] = dateInput.split('-');
        return `${day}/${month}/${year}`;
    }

    let date: Date;

    if (typeof dateInput === 'string') {
        const cleanStr = dateInput.replace("Z", "").replace(" ", "T");
        date = new Date(cleanStr);
    } else {
        date = dateInput;
    }

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
