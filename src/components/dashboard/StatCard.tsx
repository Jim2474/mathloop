type StatCardProps = {
  label: string;
  value: number | string;
  tone?: "default" | "accent" | "cool";
};

const toneClass = {
  default: "",
  accent: "",
  cool: "",
};

export default function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <div className={`apple-tile rounded-[22px] px-6 py-5 ${toneClass[tone]}`}>
      <p className="text-[13px] tracking-[-0.12px] text-ink/45">{label}</p>
      <p className="mt-4 text-[2.65rem] font-semibold leading-none tracking-[-0.36px] text-ink">{value}</p>
    </div>
  );
}
