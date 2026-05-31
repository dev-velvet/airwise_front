export type AqiCategory =
  | "Buena"
  | "Moderada"
  | "Dañina a grupos sensibles"
  | "Dañina"
  | "Muy dañina";

export function aqiColor(cat: string): string {
  switch (cat) {
    case "Buena": return "var(--aqi-good)";
    case "Moderada": return "var(--aqi-moderate)";
    case "Dañina a grupos sensibles": return "var(--aqi-sensitive)";
    case "Dañina": return "var(--aqi-bad)";
    case "Muy dañina": return "var(--aqi-very-bad)";
    default: return "var(--muted)";
  }
}

export function aqiTextClass(cat: string): string {
  switch (cat) {
    case "Buena": return "text-[color:var(--aqi-good)]";
    case "Moderada": return "text-[color:var(--aqi-moderate)]";
    case "Dañina a grupos sensibles": return "text-[color:var(--aqi-sensitive)]";
    case "Dañina": return "text-[color:var(--aqi-bad)]";
    case "Muy dañina": return "text-[color:var(--aqi-very-bad)]";
    default: return "text-muted-foreground";
  }
}
