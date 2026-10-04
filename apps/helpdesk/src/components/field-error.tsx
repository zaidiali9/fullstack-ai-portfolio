export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}
