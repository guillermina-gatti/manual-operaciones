// Removes the spaces around a string; any other value is left for the validators to reject.
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
