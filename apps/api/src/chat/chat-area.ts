// Área que la pregunta nombra ("¿Cuánto dura la vigencia en Ventas?", "es para el área de operaciones").
// Si nombra una, la búsqueda se limita a los documentos de esa área (además de los permisos del usuario).
const AREAS = ['Ventas', 'Operaciones', 'Logística', 'Atención al cliente', 'Administración'];

// Sin tildes ni mayúsculas, para comparar nombres de área con lo que escribe la persona.
const normalize = (text: string): string =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function focusAreaOf(question: string): string | null {
    const text = normalize(question);
    for (const area of AREAS) {
        if (new RegExp(`\\b${normalize(area)}\\b`).test(text)) return area;
    }
    return null;
}

// Respuesta cuando la pregunta es de un área y no hay nada vigente que la responda dentro de esa área.
export function focusNoInfoText(area: string): string {
    return `No encontré información sobre eso en los documentos vigentes del área ${area} a los que tenés acceso. Si la consulta es de esa área, preguntale a su responsable.`;
}