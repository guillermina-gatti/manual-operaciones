// Cuándo se pregunta "¿Te sirvió esta respuesta?" (HU25). No en la primera pregunta de la conversación.
// Sí cuando la respuesta sale de un documento concreto (tiene fuentes) o cuando el asistente cierra la
// conversación preguntando si necesitás algo más.
const CLOSING = /necesit[aá]s algo m[aá]s\?/i;

export function asksFeedback(
    status: string,
    sources: { length: number },
    answer: string,
    isFirstQuestion: boolean,
): boolean {
    if (isFirstQuestion) return false;
    if (status !== 'answered' && status !== 'conflict') return false;
    return sources.length > 0 || CLOSING.test(answer);
}