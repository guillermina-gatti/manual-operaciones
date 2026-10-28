// Removes the spaces around a string; any other value is left for the validators to reject.
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Lowercases every string of a list of ids. Ids are compared as text, so the same area written
// with different case would otherwise pass ArrayUnique; anything else is left for the validators.
export const lowerCaseIds = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((id: unknown) =>
        typeof id === 'string' ? id.toLowerCase() : id,
      )
    : value;
