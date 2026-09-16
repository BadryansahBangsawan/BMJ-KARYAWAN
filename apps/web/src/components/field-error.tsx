export function FieldError({
  id,
  errors,
}: {
  id: string;
  errors: Array<{ message?: string } | undefined>;
}) {
  return (
    <>
      {errors.map((error) =>
        error?.message ? (
          <p key={error.message} id={id} className="text-sm text-destructive">
            {error.message}
          </p>
        ) : null,
      )}
    </>
  );
}

export function fieldDescribedBy(id: string, errors: Array<{ message?: string } | undefined>) {
  return errors.some((error) => error?.message) ? id : undefined;
}

export function focusFirstInvalid() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  });
}
