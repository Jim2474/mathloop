type EmptyStateProps = {
  title: string;
  description?: string;
};

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white/55 p-8 text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-2 text-sm text-ink/60">{description}</p> : null}
    </div>
  );
}
