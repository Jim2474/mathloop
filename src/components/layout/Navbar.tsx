import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/questions", label: "题库" },
  { to: "/review", label: "复习" },
  { to: "/backup", label: "备份" },
];

export default function Navbar() {
  return (
    <nav className="flex flex-wrap gap-2">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            [
              "rounded-full px-4 py-2 text-sm font-medium transition",
              isActive
                ? "bg-ink text-paper shadow-soft"
                : "text-ink/70 hover:bg-white/80 hover:text-ink",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
