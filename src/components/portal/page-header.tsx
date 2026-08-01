export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-10 border-b-2 border-moody pb-8 lg:mb-14">
      <h1 className="text-h1">
        {title}<span aria-hidden className="page-star" />
      </h1>
      {description && <p className="mt-4 text-sm opacity-55">{description}</p>}
    </header>
  );
}
