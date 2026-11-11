// The checks of the forms, with the same limits as the API (spec 006, R2 and R6). The API validates
// again: these only save a trip and say what is wrong next to the field.

export const LIMITS = {
  procedureTitle: 200,
  procedureDescription: 1000,
  stepTitle: 200,
  stepDescription: 2000,
} as const;

export interface FormValues {
  title: string;
  description: string;
}

export interface FormErrors {
  title?: string;
  description?: string;
}

// The spaces at the beginning and at the end do not count.
function validate(values: FormValues, titleMax: number, descriptionMax: number): FormErrors {
  const errors: FormErrors = {};
  const title = values.title.trim();
  if (title === '') errors.title = 'Escribí un título.';
  else if (title.length > titleMax) {
    errors.title = `El título puede tener hasta ${titleMax} caracteres.`;
  }
  if (values.description.trim().length > descriptionMax) {
    errors.description = `La descripción puede tener hasta ${descriptionMax} caracteres.`;
  }
  return errors;
}

export function validateProcedure(values: FormValues): FormErrors {
  return validate(values, LIMITS.procedureTitle, LIMITS.procedureDescription);
}

export function validateStep(values: FormValues): FormErrors {
  return validate(values, LIMITS.stepTitle, LIMITS.stepDescription);
}
