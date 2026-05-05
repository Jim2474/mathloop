type StatCardProps = {
  label: string;
  value: number | string;
  tone?: "default" | "accent" | "cool";
};

const toneClass = {
  default: "border-line bg-white/70",
  accent: "border-cinnabar/30 bg-cinnabar/10",
  cool: "border-slateblue/25 bg-slateblue/10",
};

export default function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <div className={`rounded-lg border p-5 shadow-soft ${toneClass[tone]}`}>
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-normal text-ink">{value}</p>
    </div>
  );
}
