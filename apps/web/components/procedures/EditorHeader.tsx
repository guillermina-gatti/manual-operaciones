// The top of the editor of a procedure (spec 015, D21): on its own page, the back link and the h1; inside
// the list screen (embedded), the title is an h2 because that screen already has its h1.
import Link from 'next/link';
import { BACK_LINK } from '@/components/documents/design';
import { PAGE_SUBTITLE, PAGE_TITLE, PageHeader } from '@/components/documents/list-design';

interface EditorHeaderProps {
  title: string;
  subtitle: string;
  embedded: boolean;
}

export function EditorHeader({ title, subtitle, embedded }: EditorHeaderProps) {
  if (embedded) {
    return (
      <header className="flex min-w-0 flex-col gap-2">
        <h2 className={`${PAGE_TITLE} min-w-0 break-words`}>{title}</h2>
        <p className={`${PAGE_SUBTITLE} break-words`}>{subtitle}</p>
      </header>
    );
  }

  return (
    <>
      <Link href="/procedimientos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
      </Link>
      <PageHeader wrap title={title} subtitle={subtitle} />
    </>
  );
}
