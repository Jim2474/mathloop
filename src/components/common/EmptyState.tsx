type EmptyStateProps = {
  title: string;
  description?: string;
};

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="apple-glass rounded-[18px] p-10 text-center">
      <h2 className="text-xl font-semibold tracking-[-0.28px] text-ink">{title}</h2>
      {description ? <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/58">{description}</p> : null}
    </div>
  );
}
