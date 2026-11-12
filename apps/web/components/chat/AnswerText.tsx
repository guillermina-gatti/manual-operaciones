// El texto de una respuesta del asistente con su Markdown (lib/chat/markdown.ts): párrafos, listas con
// viñetas o numeradas, subtítulos y negritas. Todo va como elementos de React con texto común: nada de lo
// que mande el modelo se interpreta como HTML. Cada pedazo de texto pasa por renderText, que es quien
// dibuja las citas y las rutas (o el texto tal cual, mientras llega la respuesta).
import { Fragment, type ReactNode } from 'react';
import { type Inline, parseMarkdown } from '@/lib/chat/markdown';

interface AnswerTextProps {
  text: string;
  renderText: (text: string) => ReactNode;
}

function InlineText({ parts, renderText }: { parts: Inline[]; renderText: AnswerTextProps['renderText'] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'strong' ? (
          <strong key={index} className="font-semibold">
            {renderText(part.text)}
          </strong>
        ) : (
          <Fragment key={index}>{renderText(part.text)}</Fragment>
        ),
      )}
    </>
  );
}

// Todo texto se corta en la burbuja, también una URL o una palabra larga.
export function AnswerText({ text, renderText }: AnswerTextProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 break-words [overflow-wrap:anywhere]">
      {parseMarkdown(text).map((block, index) => {
        if (block.type === 'heading') {
          // Un subtítulo chico dentro de la respuesta, no un título de página.
          return (
            <h3 key={index} className="text-base font-bold text-bosque">
              <InlineText parts={block.inline} renderText={renderText} />
            </h3>
          );
        }
        if (block.type === 'list') {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <InlineText parts={item} renderText={renderText} />
            </li>
          ));
          return block.ordered ? (
            <ol key={index} start={block.start} className="flex list-decimal flex-col gap-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <InlineText parts={line} renderText={renderText} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
