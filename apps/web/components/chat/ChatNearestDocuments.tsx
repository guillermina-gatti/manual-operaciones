// HU19: cuando el asistente no encuentra respuesta, los documentos más cercanos a la consulta, para
// que el empleado tenga a dónde ir. No son fuentes: no se citan ni se numeran.
import Link from 'next/link';
import type { NearestDocument } from '@/lib/api';
import { TEXT_LINK } from './design';

export function ChatNearestDocuments({ documents }: { documents?: NearestDocument[] }) {
    if (!documents || documents.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-texto">Estos documentos pueden ayudarte</p>
            <ul aria-label="Documentos cercanos" className="flex flex-col gap-1">
                {documents.map((document) => (
                    <li key={document.documentId} className="min-w-0">
                        <Link href={`/documentos/${document.documentId}`} className={`${TEXT_LINK} break-words`}>
                            {document.documentTitle}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}