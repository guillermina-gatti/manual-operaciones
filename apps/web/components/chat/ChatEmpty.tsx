// La pantalla vacía del asistente: qué puede preguntar, con ejemplos que llenan el compositor (no envían).
import { CHIP } from './design';

export const EXAMPLE_QUESTIONS = [
    '¿Cómo veo un documento?',
    '¿Dónde veo las métricas?',
    '¿De dónde sale una respuesta?',
];

export function ChatEmpty({ onPick }: { onPick: (question: string) => void }) {
    return (
        <div className="flex flex-col gap-4">
            <p className="text-texto-suave">Preguntá sobre los documentos vigentes de tus áreas.</p>
            <ul aria-label="Ejemplos de preguntas" className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                    <li key={question}>
                        <button type="button" className={CHIP} onClick={() => onPick(question)}>
                            {question}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}