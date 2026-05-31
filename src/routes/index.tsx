import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { aqiColor, aqiTextClass } from "@/lib/aqi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  BarChart, Bar,
} from "recharts";
import { Activity, AlertTriangle, MapPin, TrendingUp, Wind, Calculator, Skull } from "lucide-react";

const AirMap = lazy(() => import("@/components/AirMap").then((m) => ({ default: m.AirMap })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AireSalud — Monitoreo PM2.5 y riesgo en salud pública" },
      { name: "description", content: "Tablero en vivo de calidad del aire (PM2.5) y su impacto epidemiológico en el Valle de Aburrá." },
    ],
  }),
  component: Dashboard,
});

type Station = {
  id: number; estacion: string; latitud: number; longitud: number;
  pm25_ica: number; categoria_ica: string; municipio_id: number | null;
};
type Municipio = { id: number; nombre: string };

function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [trend, setTrend] = useState<{ periodo: number; casos: number; muertes: number }[]>([]);
  const [ranking, setRanking] = useState<{ nombre: string; casos: number }[]>([]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: m }, { data: enf }, { data: def }] = await Promise.all([
        supabase.from("mediciones_siata").select("*").order("pm25_ica", { ascending: false }),
        supabase.from("municipios").select("*").order("nombre"),
        supabase.from("enfermedades").select("municipio_id, periodo, casos"),
        supabase.from("defunciones").select("periodo, muertes"),
      ]);
      setStations((s ?? []) as Station[]);
      setMunicipios((m ?? []) as Municipio[]);

      // trend by year (sum across municipios)
      const byYear = new Map<number, { casos: number; muertes: number }>();
      (enf ?? []).forEach((r: any) => {
        const e = byYear.get(r.periodo) ?? { casos: 0, muertes: 0 };
        e.casos += r.casos; byYear.set(r.periodo, e);
      });
      (def ?? []).forEach((r: any) => {
        const e = byYear.get(r.periodo) ?? { casos: 0, muertes: 0 };
        e.muertes += r.muertes; byYear.set(r.periodo, e);
      });
      setTrend([...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([periodo, v]) => ({ periodo, ...v })));

      // ranking by municipio
      const byMun = new Map<number, number>();
      (enf ?? []).forEach((r: any) => byMun.set(r.municipio_id, (byMun.get(r.municipio_id) ?? 0) + r.casos));
      const muniMap = new Map((m ?? []).map((x: any) => [x.id, x.nombre]));
      setRanking(
        [...byMun.entries()]
          .map(([mid, casos]) => ({ nombre: muniMap.get(mid) ?? "—", casos }))
          .sort((a, b) => b.casos - a.casos)
      );
    })();
  }, []);

  const avgPm25 = useMemo(
    () => stations.length ? stations.reduce((a, s) => a + Number(s.pm25_ica), 0) / stations.length : 0,
    [stations]
  );
  const worst = stations[0];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border" style={{ background: "var(--gradient-hero)" }}>
        <div className="max-w-7xl mx-auto px-6 py-12 fade-up">
          <div className="flex items-center gap-2 text-primary text-sm font-mono uppercase tracking-widest">
            <Wind className="h-4 w-4" /> SIATA · Valle de Aburrá · en vivo
          </div>
          <h1 className="mt-3 text-5xl md:text-6xl font-bold leading-tight">
            Aire<span className="text-primary">Salud</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
            Sensores de PM2.5 cruzados con datos epidemiológicos para estimar el impacto real
            de la contaminación sobre la salud pública.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        {/* SECCIÓN A */}
        <section className="space-y-6 fade-up">
          <SectionHeader icon={<MapPin className="h-5 w-5" />} eyebrow="Sección A" title="Estado actual y mapa de calor" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <KpiCard
              icon={<Activity />}
              label="PM2.5 promedio regional"
              value={`${avgPm25.toFixed(1)}`}
              unit="µg/m³"
              hint={`${stations.length} estaciones activas`}
            />
            <KpiCard
              icon={<AlertTriangle />}
              label="Estación más crítica"
              value={worst ? `${Number(worst.pm25_ica).toFixed(1)}` : "—"}
              unit="µg/m³"
              hint={worst?.estacion ?? ""}
              accent
            />
            <KpiCard
              icon={<Wind />}
              label="Categoría dominante"
              value={dominantCategory(stations)}
              unit=""
              hint="según ICA de cada estación"
            />
          </div>

          <Card className="overflow-hidden p-0" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-[480px]">
              {mounted ? (
                <Suspense fallback={<MapSkeleton />}>
                  <AirMap stations={stations} />
                </Suspense>
              ) : <MapSkeleton />}
            </div>
            <Legend2 />
          </Card>
        </section>

        {/* SECCIÓN B */}
        <section className="space-y-6 fade-up">
          <SectionHeader icon={<Calculator className="h-5 w-5" />} eyebrow="Sección B" title="Calculadora de riesgo personalizado" />
          <RiskCalculator municipios={municipios} />
        </section>

        {/* SECCIÓN C */}
        <section className="space-y-6 fade-up">
          <SectionHeader icon={<TrendingUp className="h-5 w-5" />} eyebrow="Sección C" title="Tendencias históricas" />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <Card className="lg:col-span-3 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Enfermedades vs Defunciones por año</h3>
                <span className="text-xs text-muted-foreground">2008 — 2023</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={trend}>
                    <CartesianGrid stroke="oklch(0.30 0.03 250 / 0.4)" strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" stroke="oklch(0.7 0.02 240)" />
                    <YAxis stroke="oklch(0.7 0.02 240)" />
                    <Tooltip contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend />
                    <Line type="monotone" dataKey="casos" stroke="oklch(0.78 0.18 175)" strokeWidth={2.5} dot={false} name="Enfermedades" />
                    <Line type="monotone" dataKey="muertes" stroke="oklch(0.72 0.20 320)" strokeWidth={2.5} dot={false} name="Defunciones" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="lg:col-span-2 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Ranking de morbilidad</h3>
                <Skull className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                {ranking.map((r, i) => {
                  const max = ranking[0]?.casos ?? 1;
                  const pct = (r.casos / max) * 100;
                  return (
                    <div key={r.nombre} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          <span className="text-muted-foreground mr-2">{String(i + 1).padStart(2, "0")}</span>
                          {r.nombre}
                        </span>
                        <span className="font-mono text-primary">{r.casos.toLocaleString("es-CO")}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-muted-foreground">
          Datos basados en mediciones SIATA y registros epidemiológicos del Valle de Aburrá.
        </footer>
      </main>
    </div>
  );
}

function dominantCategory(stations: Station[]) {
  if (!stations.length) return "—";
  const counts: Record<string, number> = {};
  stations.forEach((s) => { counts[s.categoria_ica] = (counts[s.categoria_ica] ?? 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function SectionHeader({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-primary text-xs font-mono uppercase tracking-widest">
        {icon} {eyebrow}
      </div>
      <h2 className="text-2xl md:text-3xl font-bold mt-1">{title}</h2>
    </div>
  );
}

function KpiCard({ icon, label, value, unit, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; unit: string; hint?: string; accent?: boolean;
}) {
  return (
    <Card className="p-6 relative overflow-hidden group transition-all hover:-translate-y-0.5"
          style={{ boxShadow: accent ? "var(--shadow-glow)" : "var(--shadow-card)" }}>
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-20 blur-2xl"
           style={{ background: accent ? "var(--gradient-accent)" : "var(--gradient-primary)" }} />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          {label}
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-4xl font-bold font-display">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        {hint && <div className="mt-2 text-xs text-muted-foreground truncate">{hint}</div>}
      </div>
    </Card>
  );
}

function MapSkeleton() {
  return <div className="h-full w-full bg-muted/40 animate-pulse" />;
}

function Legend2() {
  const items = [
    { c: "Buena", v: "0–12" },
    { c: "Moderada", v: "12–35" },
    { c: "Dañina a grupos sensibles", v: "35–55" },
    { c: "Dañina", v: "55–150" },
    { c: "Muy dañina", v: "150+" },
  ];
  return (
    <div className="flex flex-wrap gap-4 px-5 py-3 border-t border-border bg-surface/50">
      {items.map((it) => (
        <div key={it.c} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: aqiColor(it.c) }} />
          <span className="text-foreground">{it.c}</span>
          <span className="text-muted-foreground">{it.v} µg/m³</span>
        </div>
      ))}
    </div>
  );
}

function RiskCalculator({ municipios }: { municipios: Municipio[] }) {
  const [municipio, setMunicipio] = useState<string>("");
  const [edad, setEdad] = useState<string>("");
  const [sexo, setSexo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    estacion: string; pm25: number; categoria: string; beta: number; riesgo: number;
  }>(null);
  const [error, setError] = useState<string>("");

  const grupoEdad = useMemo(() => {
    const n = parseInt(edad, 10);
    if (isNaN(n)) return null;
    if (n <= 14) return "0-14";
    if (n <= 44) return "15-44";
    if (n <= 64) return "45-64";
    return "65+";
  }, [edad]);

  async function calc() {
    setError(""); setResult(null);
    if (!municipio || !grupoEdad || !sexo) { setError("Completa todos los campos."); return; }
    setLoading(true);
    try {
      const muni = municipios.find((m) => String(m.id) === municipio);
      if (!muni) throw new Error("Municipio inválido");
      const { data: med } = await supabase
        .from("mediciones_siata").select("*")
        .ilike("estacion", `%${muni.nombre}%`)
        .order("pm25_ica", { ascending: false }).limit(1).maybeSingle();

      // Fallback by municipio_id
      let station: any = med;
      if (!station) {
        const { data } = await supabase
          .from("mediciones_siata").select("*")
          .eq("municipio_id", muni.id)
          .order("pm25_ica", { ascending: false }).limit(1).maybeSingle();
        station = data;
      }
      if (!station) throw new Error("Sin mediciones para este municipio.");

      const { data: riesgo } = await supabase
        .from("analisis_riesgo").select("beta")
        .eq("municipio_id", muni.id).eq("contaminante_id", 1)
        .eq("grupo_edad", grupoEdad).eq("sexo", sexo).maybeSingle();
      if (!riesgo) throw new Error("Sin coeficiente para el perfil.");

      const pm = Number(station.pm25_ica);
      const beta = Number(riesgo.beta);
      setResult({
        estacion: station.estacion, pm25: pm, categoria: station.categoria_ica,
        beta, riesgo: pm * beta,
      });
    } catch (e: any) { setError(e.message ?? "Error"); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Combina mediciones en vivo de PM2.5 con coeficientes epidemiológicos (β) por municipio,
          edad y sexo para estimar el incremento de riesgo individual.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Municipio</Label>
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger><SelectValue placeholder="Selecciona municipio" /></SelectTrigger>
              <SelectContent>
                {municipios.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Edad</Label>
              <Input type="number" min={0} max={120} value={edad} onChange={(e) => setEdad(e.target.value)} placeholder="35" />
            </div>
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Select value={sexo} onValueChange={setSexo}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={calc} disabled={loading} className="w-full mt-2"
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            {loading ? "Calculando…" : "Calcular riesgo"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <div className="relative rounded-xl p-6 overflow-hidden border border-border"
           style={{ background: "linear-gradient(135deg, oklch(0.20 0.04 250), oklch(0.16 0.03 270))" }}>
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-30"
             style={{ background: "var(--gradient-accent)" }} />
        <div className="relative">
          <div className="text-xs font-mono uppercase tracking-widest text-primary">Resultado</div>
          {result ? (
            <div className="mt-3 space-y-4 fade-up">
              <div>
                <div className="text-xs text-muted-foreground">Estación de referencia</div>
                <div className="font-medium">{result.estacion}</div>
                <div className={`text-xs ${aqiTextClass(result.categoria)}`}>{result.categoria}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="PM2.5 actual" value={result.pm25.toFixed(1)} unit="µg/m³" />
                <Metric label="Coeficiente β" value={result.beta.toFixed(6)} unit="" />
              </div>
              <div className="pt-4 border-t border-border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Incremento de riesgo</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-5xl font-bold font-display"
                        style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    {result.riesgo.toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  PM2.5 × β = {result.pm25.toFixed(1)} × {result.beta.toFixed(6)}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              Ingresa los datos y presiona calcular para ver tu estimación personalizada.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold font-display">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
