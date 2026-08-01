export function PageHeader({
  description,
}: {
  description: string;
}) {
  return (
    <header className="mb-10 max-w-4xl lg:mb-12">
      <span className="portal-pill">{description}</span>
    </header>
  );
}
