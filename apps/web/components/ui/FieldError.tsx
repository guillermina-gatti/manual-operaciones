// Error debajo de un campo del formulario (F2, F3). El campo lo apunta con aria-describedby={id},
// así un lector de pantalla lee el error al entrar en el campo.
interface FieldErrorProps {
  id: string;
  message?: string;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}
