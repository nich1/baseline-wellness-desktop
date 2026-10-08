import Link from "next/link";
import { SettingsButton } from "./SettingsButton";
export function AnalysisNav({ active }: { active: string }) {
  return <nav className="analysis-nav" aria-label="Trends">
    {[["/trends", "Bodyweight"], ["/trends/nutrition", "Nutrition"], ["/strength", "Strength"], ["/cardio", "Cardio"], ["/trends/targets", "Targets"], ["/export", "Export"], ["/", "Daily log"]].map(([href, label]) => <Link key={href} href={href} className={active === href ? "active" : ""} aria-current={active === href ? "page" : undefined}>{label}</Link>)}
    <SettingsButton />
  </nav>;
}
