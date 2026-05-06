import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/mistakes", label: "错题录入" },
  { to: "/questions", label: "题库" },
  { to: "/review", label: "复习" },
  { to: "/backup", label: "备份" },
];

export default function Navbar() {
  return (
    <nav className="flex flex-wrap gap-1 rounded-full border border-white/45 bg-white/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] backdrop-blur-xl">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            [
              "rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.224px] transition",
              isActive
                ? "bg-white/70 text-ink shadow-[0_8px_18px_rgba(29,29,31,0.08),inset_0_1px_0_rgba(255,255,255,0.72)]"
                : "text-ink/58 hover:bg-white/45 hover:text-ink",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
