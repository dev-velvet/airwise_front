import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { aqiColor, aqiTextClass } from "@/lib/aqi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  BarChart, Bar, Cell,
} from "recharts";
import {
  Activity, AlertTriangle, MapPin, TrendingUp, Wind, Calculator, Skull,
  BarChart3, Users, Info, Layers, ArrowUpDown
} from "lucide-react";
import {
  fetchMunicipios,
  fetchEstaciones,
  fetchEnfermedades,
  fetchDefunciones,
  fetchRiesgoCruzado,
  fetchTasasMortalidad,
  fetchSusceptibilidad,
  Station,
  Municipio,
  RiesgoCruzadoResult,
  EnfermedadData,
  DefuncionData,
  TasaMortalidadMunicipio,
  SusceptibilidadItem,
} from "@/lib/api-client";

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

// Perfil de susceptibilidad empírico base (Grisales-Romero et al. / AnalisisRiesgo 2008-2017)
type SuscBarItem = {
  grupo: string;
  riesgo_pct: number;
  ic_inf: number;
  ic_sup: number;
  color: string;
};

const DEFAULT_SUSC_EDAD: SuscBarItem[] = [
  { grupo: "Menores de 5 años", riesgo_pct: 10.71, ic_inf: 4.10, ic_sup: 12.00, color: "oklch(0.72 0.20 320)" },
  { grupo: "Mayores de 65 años", riesgo_pct: 6.75, ic_inf: 2.10, ic_sup: 8.00, color: "oklch(0.78 0.18 175)" },
  { grupo: "5 a 14 años", riesgo_pct: 6.70, ic_inf: 1.50, ic_sup: 8.00, color: "oklch(0.75 0.16 220)" },
];

const DEFAULT_SUSC_DIAGNOSTICO: SuscBarItem[] = [
  { grupo: "IRA Inferior", riesgo_pct: 9.17, ic_inf: 3.20, ic_sup: 11.20, color: "oklch(0.80 0.18 85)" },
  { grupo: "IRA Superior", riesgo_pct: 8.72, ic_inf: 2.50, ic_sup: 10.10, color: "oklch(0.78 0.18 175)" },
  { grupo: "Influenza/Neumonía", riesgo_pct: 6.91, ic_inf: 1.80, ic_sup: 9.00, color: "oklch(0.72 0.20 320)" },
  { grupo: "Oído Medio", riesgo_pct: 6.14, ic_inf: 1.20, ic_sup: 8.10, color: "oklch(0.68 0.14 280)" },
];

// Tasas ajustadas de mortalidad respiratoria por 100.000 hab. (DANE / AMVA 2008-2017)
const DEFAULT_TASAS_MORTALIDAD = [
  { nombre: "Caldas", valor: 88.67 },
  { nombre: "Itagüí", valor: 85.88 },
  { nombre: "Barbosa", valor: 83.19 },
  { nombre: "La Estrella", valor: 82.97 },
  { nombre: "Envigado", valor: 76.28 },
  { nombre: "Bello", valor: 73.84 },
  { nombre: "Copacabana", valor: 70.48 },
  { nombre: "Girardota", valor: 65.69 },
  { nombre: "Sabaneta", valor: 65.66 },
  { nombre: "Medellín", valor: 56.92 },
];

function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  
  // Series multivariadas de morbilidad
  const [trendPatologia, setTrendPatologia] = useState<{
    periodo: number;
    ira_alta: number;
    ira_baja: number;
    influenza: number;
    total: number;
  }[]>([]);

  // Perfil de susceptibilidad y ranking territorial
  const [suscEdad, setSuscEdad] = useState<SuscBarItem[]>(DEFAULT_SUSC_EDAD);
  const [suscDiag, setSuscDiag] = useState<SuscBarItem[]>(DEFAULT_SUSC_DIAGNOSTICO);
  const [suscFiltro, setSuscFiltro] = useState<"edad" | "patologia">("edad");
  const [rankingTasas, setRankingTasas] = useState(DEFAULT_TASAS_MORTALIDAD);
  const [rankingCasos, setRankingCasos] = useState<{ nombre: string; valor: number }[]>([]);
  const [rankingMetric, setRankingMetric] = useState<"tasa" | "casos">("tasa");
  const [mapMetric, setMapMetric] = useState<"24h" | "instantaneo">("24h");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function processData(
    s: Station[],
    m: Municipio[],
    enf: EnfermedadData[] | null,
    def: DefuncionData[] | null,
    tasasApi: TasaMortalidadMunicipio[] | null,
    suscApi: any
  ) {
    setStations(s);
    setMunicipios(m);

    // 1. Serie temporal segmentada por categoría diagnóstica
    const byYearDiag = new Map<number, { periodo: number; ira_alta: number; ira_baja: number; influenza: number; total: number }>();
    (enf ?? []).forEach((r) => {
      const e = byYearDiag.get(r.anio) ?? { periodo: r.anio, ira_alta: 0, ira_baja: 0, influenza: 0, total: 0 };
      const d = (r.grupo_diagnostico || "").toLowerCase();
      if (d.includes("superior") || d.includes("vias respiratorias superiores")) {
        e.ira_alta += r.casos;
      } else if (d.includes("inferior") || d.includes("vias respiratorias inferiores")) {
        e.ira_baja += r.casos;
      } else if (d.includes("influenza") || d.includes("gripe") || d.includes("neumon")) {
        e.influenza += r.casos;
      }
      e.total += r.casos;
      byYearDiag.set(r.anio, e);
    });

    const trendFormatted = [...byYearDiag.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([_, v]) => v);
    setTrendPatologia(trendFormatted);

    // 2. Ranking de casos brutos
    const byMunCasos = new Map<string, number>();
    (enf ?? []).forEach((r) => byMunCasos.set(r.municipio, (byMunCasos.get(r.municipio) ?? 0) + r.casos));
    const sortedCasos = [...byMunCasos.entries()]
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
    if (sortedCasos.length > 0) setRankingCasos(sortedCasos);

    // 3. Tasas de mortalidad ajustadas
    if (tasasApi && tasasApi.length > 0) {
      setRankingTasas(tasasApi.map((t) => ({ nombre: t.municipio, valor: Number(t.tasa_ajustada_promedio) })));
    }

    // 4. Perfil de susceptibilidad epidemiológica
    if (suscApi) {
      // Caso estructurado { por_edad, por_diagnostico }
      if (suscApi.por_edad && Array.isArray(suscApi.por_edad) && suscApi.por_edad.length > 0) {
        setSuscEdad(
          suscApi.por_edad.map((item: any) => ({
            grupo: item.grupo,
            riesgo_pct: Number(item.incremento_riesgo_pct),
            ic_inf: item.limite_inferior != null ? Number(item.limite_inferior) : 0,
            ic_sup: item.limite_superior != null ? Number(item.limite_superior) : 0,
            color: item.grupo?.includes("<5") || item.grupo?.includes("Menor")
              ? "oklch(0.72 0.20 320)"
              : "oklch(0.78 0.18 175)",
          }))
        );
      }
      if (suscApi.por_diagnostico && Array.isArray(suscApi.por_diagnostico) && suscApi.por_diagnostico.length > 0) {
        setSuscDiag(
          suscApi.por_diagnostico.map((item: any) => {
            let clean = item.grupo;
            if (clean.includes("inferior")) clean = "IRA Inferior";
            else if (clean.includes("superior")) clean = "IRA Superior";
            else if (clean.includes("influenza") || clean.includes("neumon")) clean = "Influenza/Neumonía";
            else if (clean.includes("oído") || clean.includes("mastoides")) clean = "Oído Medio";
            else if (clean.includes("sistema respiratorio")) clean = "Total Respiratorias";

            return {
              grupo: clean,
              riesgo_pct: Number(item.incremento_riesgo_pct),
              ic_inf: item.limite_inferior != null ? Number(item.limite_inferior) : 0,
              ic_sup: item.limite_superior != null ? Number(item.limite_superior) : 0,
              color: clean.includes("Inferior")
                ? "oklch(0.80 0.18 85)"
                : clean.includes("Superior")
                ? "oklch(0.78 0.18 175)"
                : "oklch(0.72 0.20 320)",
            };
          })
        );
      } else if (Array.isArray(suscApi) && suscApi.length > 0) {
        // Caso plano (arreglo)
        const edadMap = new Map<string, { sum: number; count: number; inf: number; sup: number }>();
        const diagMap = new Map<string, { sum: number; count: number; inf: number; sup: number }>();

        suscApi.forEach((item: any) => {
          if (item.grupo_edad) {
            const cur = edadMap.get(item.grupo_edad) ?? { sum: 0, count: 0, inf: 0, sup: 0 };
            cur.sum += Number(item.incremento_riesgo_pct || 0);
            cur.count += 1;
            cur.inf = Number(item.limite_inferior || 0);
            cur.sup = Number(item.limite_superior || 0);
            edadMap.set(item.grupo_edad, cur);
          }
          const diagNombre = item.grupo_diagnostico || item.grupo;
          if (diagNombre && !diagNombre.includes("año") && !diagNombre.includes("Menor") && !diagNombre.includes("Mayor")) {
            let clean = diagNombre;
            if (clean.includes("inferior")) clean = "IRA Inferior";
            else if (clean.includes("superior")) clean = "IRA Superior";
            else if (clean.includes("influenza") || clean.includes("neumon")) clean = "Influenza/Neumonía";
            else if (clean.includes("oído") || clean.includes("mastoides")) clean = "Oído Medio";
            else if (clean.includes("sistema respiratorio")) clean = "Total Respiratorias";

            const cur = diagMap.get(clean) ?? { sum: 0, count: 0, inf: 0, sup: 0 };
            cur.sum += Number(item.incremento_riesgo_pct || 0);
            cur.count += 1;
            cur.inf = Number(item.limite_inferior || 0);
            cur.sup = Number(item.limite_superior || 0);
            diagMap.set(clean, cur);
          }
        });

        if (edadMap.size > 0) {
          setSuscEdad(
            [...edadMap.entries()].map(([grupo, v]) => ({
              grupo,
              riesgo_pct: Number((v.sum / v.count).toFixed(2)),
              ic_inf: v.inf,
              ic_sup: v.sup,
              color: grupo.includes("<5") || grupo.includes("Menor") ? "oklch(0.72 0.20 320)" : "oklch(0.78 0.18 175)",
            }))
          );
        }
        if (diagMap.size > 0) {
          setSuscDiag(
            [...diagMap.entries()].map(([grupo, v]) => ({
              grupo,
              riesgo_pct: Number((v.sum / v.count).toFixed(2)),
              ic_inf: v.inf,
              ic_sup: v.sup,
              color: grupo.includes("Inferior") ? "oklch(0.80 0.18 85)" : "oklch(0.78 0.18 175)",
            }))
          );
        }
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = false;
      for (let attempt = 0; attempt < 12 && !loaded && !cancelled; attempt++) {
        if (attempt > 0) {
          setRefreshing(true);
          await new Promise((r) => setTimeout(r, 5000));
        }
        try {
          const [s, m, enf, def, tasas, susc] = await Promise.all([
            fetchEstaciones(),
            fetchMunicipios(),
            fetchEnfermedades(),
            fetchDefunciones(),
            fetchTasasMortalidad().catch(() => null),
            fetchSusceptibilidad().catch(() => null),
          ]);
          if (!cancelled) {
            processData(s, m, enf, def, tasas, susc);
            loaded = true;
          }
        } catch { /* retry */ }
      }
      if (!cancelled) setLoading(false);
      if (!cancelled) setRefreshing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const avgPm25_24h = useMemo(
    () => stations.length ? stations.reduce((a, s) => a + Number(s.pm25_promedio_24h ?? s.pm25_ica), 0) / stations.length : 0,
    [stations]
  );
  const avgPm25_inst = useMemo(
    () => stations.length ? stations.reduce((a, s) => a + Number(s.pm25_ica), 0) / stations.length : 0,
    [stations]
  );
  const activeAvgPm25 = mapMetric === "24h" ? avgPm25_24h : avgPm25_inst;

  const worst = useMemo(() => {
    if (!stations.length) return null;
    return [...stations].sort((a, b) => {
      const valA = mapMetric === "24h" ? Number(a.pm25_promedio_24h ?? a.pm25_ica) : Number(a.pm25_ica);
      const valB = mapMetric === "24h" ? Number(b.pm25_promedio_24h ?? b.pm25_ica) : Number(b.pm25_ica);
      return valB - valA;
    })[0];
  }, [stations, mapMetric]);

  const suscFiltrada = useMemo(
    () => (suscFiltro === "edad" ? suscEdad : suscDiag),
    [suscFiltro, suscEdad, suscDiag]
  );

  const activeRanking = rankingMetric === "tasa" ? rankingTasas : rankingCasos;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border" style={{ background: "var(--gradient-hero)" }}>
        <div className="max-w-7xl mx-auto px-6 py-12 fade-up">
          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            Aire<span className="text-primary">Salud</span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            Plataforma de vigilancia ambiental y epidemiológica en tiempo real: integración de
            sensores SIATA (PM2.5) con coeficientes de riesgo en salud pública para el Valle de Aburrá.
          </p>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        {/* KPI Strip */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 fade-up">
          <KpiCard
            icon={<Wind />}
            label="Promedio Valle de Aburrá"
            value={loading ? "—" : activeAvgPm25.toFixed(1)}
            unit="µg/m³ PM2.5"
            hint={mapMetric === "24h" ? "Promedio móvil 24 h (Base Res. 2254)" : "Promedio instantáneo red SIATA"}
          />
          <KpiCard
            icon={<MapPin />}
            label="Estaciones operativas"
            value={loading ? "—" : String(stations.length)}
            unit="sensores"
            hint="Red de monitoreo AMVA"
          />
          <KpiCard
            icon={<AlertTriangle />}
            label="Punto más crítico"
            value={loading || !worst ? "—" : (mapMetric === "24h" ? Number(worst.pm25_promedio_24h ?? worst.pm25_ica).toFixed(0) : Number(worst.pm25_ica).toFixed(0))}
            unit="µg/m³"
            hint={worst ? `${worst.estacion} · ${mapMetric === "24h" ? (worst.categoria_ica_24h ?? worst.categoria_ica) : (worst.categoria_ica_actual ?? worst.categoria_ica)}` : "—"}
            accent
          />
          <KpiCard
            icon={<Activity />}
            label="Condición predominante"
            value={loading ? "—" : dominantCategory(stations, mapMetric)}
            unit=""
            hint={mapMetric === "24h" ? "Clasificación ICA (sobre 24 h)" : "Clasificación ICA instantánea"}
          />
        </section>

        {/* SECCIÓN A */}
        <section className="space-y-6 fade-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <SectionHeader icon={<MapPin className="h-5 w-5" />} eyebrow="Sección A" title="Red de monitoreo de calidad del aire" />
            
            {/* Conmutador de métrica del mapa */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface-elevated border border-border self-start sm:self-auto shadow-sm">
              <span className="text-[11px] font-mono text-muted-foreground mr-1.5 hidden md:inline">Métrica:</span>
              <button
                onClick={() => setMapMetric("24h")}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
                  mapMetric === "24h"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                title="Promedio móvil de las últimas 24 horas (normativo Res. 2254/2017 y OMS)"
              >
                <span className={`h-2 w-2 rounded-full ${mapMetric === "24h" ? "bg-primary-foreground" : "bg-emerald-400"}`} />
                Promedio 24 h (Norma)
              </button>
              <button
                onClick={() => setMapMetric("instantaneo")}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
                  mapMetric === "instantaneo"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                title="Última medición instantánea emitida por el sensor SIATA"
              >
                <span className={`h-2 w-2 rounded-full ${mapMetric === "instantaneo" ? "bg-primary-foreground" : "bg-amber-400"}`} />
                En vivo (Instantáneo)
              </button>
            </div>
          </div>

          <Card className="overflow-hidden p-0" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-[460px] relative">
              {mounted && !loading ? (
                <Suspense fallback={<MapSkeleton />}>
                  <AirMap stations={stations} metrica={mapMetric} />
                </Suspense>
              ) : <MapSkeleton />}
            </div>
            <Legend2 metrica={mapMetric} />
          </Card>
        </section>

        {/* SECCIÓN B */}
        <section className="space-y-6 fade-up">
          <SectionHeader icon={<Calculator className="h-5 w-5" />} eyebrow="Sección B" title="Calculadora de incremento de riesgo poblacional (24 h)" />
          <RiskCalculator municipios={municipios} />
        </section>

        {/* SECCIÓN C */}
        <section className="space-y-6 fade-up">
          <SectionHeader icon={<TrendingUp className="h-5 w-5" />} eyebrow="Sección C" title="Evidencia epidemiológica y tendencias territoriales" />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Tarjeta Gráficas Principales (3 cols) */}
            <Card className="lg:col-span-3 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Dinámica temporal y gradiente de susceptibilidad
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Series históricas de morbilidad y función concentración-respuesta (β) ante PM2.5
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-surface-elevated border border-border text-muted-foreground self-start sm:self-auto">
                  {trendPatologia.length > 0 ? `${trendPatologia[0].periodo} — ${trendPatologia[trendPatologia.length - 1].periodo}` : "2008 — 2017"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gráfica 1: Morbilidad por patología */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[oklch(0.78 0.18 175)]" />
                      Morbilidad por patología (Casos)
                    </span>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <LineChart data={trendPatologia}>
                        <CartesianGrid stroke="oklch(0.30 0.03 250 / 0.4)" strokeDasharray="3 3" />
                        <XAxis dataKey="periodo" stroke="oklch(0.7 0.02 240)" fontSize={11} />
                        <YAxis stroke="oklch(0.7 0.02 240)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface-elevated, #1e293b)",
                            border: "1px solid var(--border, #334155)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "#ffffff"
                          }}
                          labelStyle={{ color: "#ffffff", fontWeight: 600 }}
                          itemStyle={{ color: "#ffffff" }}
                          formatter={(value: any, name: any) => [Number(value).toLocaleString("es-CO"), name]}
                        />
                        <Line type="monotone" dataKey="ira_alta" stroke="oklch(0.78 0.18 175)" strokeWidth={2} dot={{ r: 2.5 }} name="IRA Superior" />
                        <Line type="monotone" dataKey="ira_baja" stroke="oklch(0.80 0.18 85)" strokeWidth={2} dot={{ r: 2.5 }} name="IRA Inferior" />
                        <Line type="monotone" dataKey="influenza" stroke="oklch(0.72 0.20 320)" strokeWidth={2} dot={{ r: 2.5 }} name="Neumonía" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Fuerte crecimiento en IRA inferior y neumonía a partir de 2010 en la red hospitalaria del AMVA.
                  </p>
                </div>

                {/* Gráfica 2: Gradiente de Susceptibilidad (ΔR % con IC 95%) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[oklch(0.72 0.20 320)]" />
                      Gradiente ΔR (%) por +10 µg/m³ PM2.5
                    </span>
                    <div className="flex gap-1 text-[10px]">
                      <button
                        onClick={() => setSuscFiltro("edad")}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          suscFiltro === "edad" ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        Edad
                      </button>
                      <button
                        onClick={() => setSuscFiltro("patologia")}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          suscFiltro === "patologia" ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        Diagnóstico
                      </button>
                    </div>
                  </div>

                  <div className="h-56">
                    <ResponsiveContainer>
                      <BarChart
                        data={suscFiltrada}
                        layout="vertical"
                        margin={{ left: 10, right: 20, top: 8, bottom: 5 }}
                        barSize={suscFiltro === "edad" ? 22 : 18}
                      >
                        <CartesianGrid stroke="oklch(0.30 0.03 250 / 0.4)" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" unit="%" stroke="oklch(0.7 0.02 240)" fontSize={11} domain={[0, 14]} />
                        <YAxis
                          dataKey="grupo"
                          type="category"
                          stroke="oklch(0.7 0.02 240)"
                          fontSize={10}
                          width={suscFiltro === "edad" ? 100 : 115}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface-elevated, #1e293b)",
                            border: "1px solid var(--border, #334155)",
                            borderRadius: 8,
                            fontSize: 11,
                            color: "#ffffff"
                          }}
                          labelStyle={{ color: "#ffffff", fontWeight: 600 }}
                          itemStyle={{ color: "#ffffff" }}
                          formatter={(v: any, _, entry: any) => [
                            `+${Number(v).toFixed(2)}% (IC 95%: [${entry.payload.ic_inf}%, ${entry.payload.ic_sup}%])`,
                            "Incremento de riesgo relativo (ΔR)"
                          ]}
                        />
                        <Bar dataKey="riesgo_pct" radius={[0, 4, 4, 0]}>
                          {suscFiltrada.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {suscFiltro === "edad"
                      ? "Menores de 5 años sufren un ΔR de +10.71%, 58% mayor que mayores de 65 años (+6.75%)."
                      : "Las IRA bajas (+9.17%) e IRA altas (+8.72%) son las más sensibles a picos de PM2.5."}
                  </p>
                </div>
              </div>
            </Card>

            {/* Tarjeta Lateral: Ranking Territorial Normalizado (2 cols) */}
            <Card className="lg:col-span-2 p-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold flex items-center gap-1.5">
                    <Skull className="h-4 w-4 text-muted-foreground" />
                    Severidad territorial
                  </h3>
                  <div className="flex gap-1 text-[11px]">
                    <button
                      onClick={() => setRankingMetric("tasa")}
                      className={`px-2 py-1 rounded transition-colors ${
                        rankingMetric === "tasa" ? "bg-primary text-primary-foreground font-semibold" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      title="Tasa ajustada por 100.000 habitantes (elimina sesgo poblacional)"
                    >
                      Tasa / 100k
                    </button>
                    <button
                      onClick={() => setRankingMetric("casos")}
                      className={`px-2 py-1 rounded transition-colors ${
                        rankingMetric === "casos" ? "bg-primary text-primary-foreground font-semibold" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      title="Casos acumulados brutos"
                    >
                      Casos
                    </button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground mb-3 flex items-center justify-between">
                  <span>
                    {rankingMetric === "tasa"
                      ? "Tasa ajustada mortalidad respiratoria"
                      : "Volumen bruto acumulado (2008–2017)"}
                  </span>
                  <span className="font-mono text-[10px] text-primary">
                    {rankingMetric === "tasa" ? "por 100k hab." : "casos"}
                  </span>
                </div>

                <div className="space-y-2">
                  {activeRanking.slice(0, 10).map((r, i) => {
                    const max = activeRanking[0]?.valor ?? 1;
                    const pct = (r.valor / max) * 100;
                    return (
                      <div key={r.nombre} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium flex items-center">
                            <span className="text-muted-foreground text-xs w-6">{String(i + 1).padStart(2, "0")}</span>
                            {r.nombre}
                          </span>
                          <span className="font-mono text-primary font-semibold">
                            {rankingMetric === "tasa"
                              ? `${r.valor.toFixed(1)}`
                              : r.valor.toLocaleString("es-CO")}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: rankingMetric === "tasa"
                                ? "linear-gradient(90deg, oklch(0.72 0.20 320), oklch(0.78 0.18 175))"
                                : "var(--gradient-primary)"
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Nota de valor epidemiológico */}
              <div className="p-3 rounded-lg bg-surface-elevated/70 border border-border/80 text-[11px] text-muted-foreground space-y-1 mt-4">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  Hallazgo epidemiológico clave:
                </div>
                <p className="leading-relaxed">
                  {rankingMetric === "tasa"
                    ? "Al normalizar por tasa por 100.000 hab., Caldas (88.7) e Itagüí (85.9) encabezan la severidad respiratoria del valle, mientras Medellín (56.9) se ubica en el extremo inferior, corrigiendo el sesgo por volumen poblacional."
                    : "El volumen bruto sitúa a Medellín en primer lugar debido a que concentra el 60% de la población metropolitana. Utiliza el selector 'Tasa / 100k' para ver el riesgo per cápita."}
                </p>
              </div>
            </Card>
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-muted-foreground border-t border-border/50">
          Datos basados en mediciones SIATA y registros epidemiológicos del Valle de Aburrá (2008–2017).
        </footer>
      </main>
    </div>
  );
}

function dominantCategory(stations: Station[], metric: "24h" | "instantaneo" = "24h") {
  if (!stations.length) return "—";
  const counts: Record<string, number> = {};
  stations.forEach((s) => {
    const val = metric === "24h" ? Number(s.pm25_promedio_24h ?? s.pm25_ica) : Number(s.pm25_ica);
    const cat = metric === "24h"
      ? (s.categoria_ica_24h ?? (val <= 12 ? "Buena" : val <= 37 ? "Moderada" : val <= 55 ? "Dañina a grupos sensibles" : val <= 150 ? "Dañina" : "Muy dañina"))
      : (s.categoria_ica_actual ?? s.categoria_ica);
    counts[cat] = (counts[cat] ?? 0) + 1;
  });
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

function Legend2({ metrica = "24h" }: { metrica?: "24h" | "instantaneo" }) {
  const items = [
    { c: "Buena", v: "0–12" },
    { c: "Moderada", v: "12–37" },
    { c: "Dañina a grupos sensibles", v: "38–55" },
    { c: "Dañina", v: "56–150" },
    { c: "Muy dañina", v: "150+" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t border-border bg-surface/50 text-xs">
      <div className="flex flex-wrap gap-4">
        {items.map((it) => (
          <div key={it.c} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: aqiColor(it.c) }} />
            <span className="text-foreground">{it.c}</span>
            <span className="text-muted-foreground">{it.v} µg/m³</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground font-mono">
        Escala ICA PM2.5 · {metrica === "24h" ? "Promedio móvil 24 h (Res. 2254)" : "Medición instantánea en vivo"}
      </div>
    </div>
  );
}

function RiskCalculator({ municipios }: { municipios: Municipio[] }) {
  const [municipio, setMunicipio] = useState<string>("");
  const [edad, setEdad] = useState<string>("");
  const [sexo, setSexo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | RiesgoCruzadoResult>(null);
  const [error, setError] = useState<string>("");

  const mappedSexo = useMemo(() => {
    if (sexo === "M") return "Hombre";
    if (sexo === "F") return "Mujer";
    if (sexo === "Ambos") return "Ambos sexos";
    return "";
  }, [sexo]);

  const grupoEdad = useMemo(() => {
    const n = parseInt(edad, 10);
    if (isNaN(n)) return null;
    if (n < 5) return "Menores de 5 años";
    if (n <= 14) return "5 a 14 años";
    if (n <= 64) return "15 a 64 años";
    return "65 años y más";
  }, [edad]);

  async function calc() {
    setError(""); setResult(null);
    if (!municipio || !grupoEdad || !mappedSexo) { setError("Completa todos los campos."); return; }
    setLoading(true);
    try {
      const muniId = parseInt(municipio, 10);
      if (isNaN(muniId)) throw new Error("Municipio inválido");
      const res = await fetchRiesgoCruzado(muniId, mappedSexo, grupoEdad);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Error al calcular el riesgo cruzado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Estima el incremento relativo del riesgo poblacional de morbilidad respiratoria aplicando
          la función concentración-respuesta (β) al <strong>promedio móvil de las últimas 24 horas de PM2.5</strong> (alineado con la Resolución 2254/2017 y guías OMS),
          contrastado con la lectura puntual en vivo.
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
                  <SelectItem value="Ambos">Ambos sexos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={calc} disabled={loading} className="w-full mt-2"
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            {loading ? "Calculando…" : "Calcular riesgo (Base 24 h)"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <div className="relative rounded-xl p-6 overflow-hidden border border-border"
           style={{ background: "linear-gradient(135deg, oklch(0.20 0.04 250), oklch(0.16 0.03 270))" }}>
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-30"
             style={{ background: "var(--gradient-accent)" }} />
        <div className="relative">
          <div className="text-xs font-mono uppercase tracking-widest text-primary">Resultado de Exposición e Impacto</div>
          {result ? (
            <div className="mt-3 space-y-4 fade-up">
              <div>
                <div className="text-xs text-muted-foreground">Estación de referencia</div>
                <div className="font-medium text-foreground">{result.estacion_monitoreo}</div>
                <div className={`text-xs ${aqiTextClass(result.categoria_ica)} font-semibold mt-0.5`}>
                  ICA: {result.categoria_ica} (sobre 24 h)
                </div>
                
                {/* Visualización de doble métrica: 24h vs instantáneo */}
                <div className="mt-2.5 p-3 rounded-lg bg-surface/40 border border-border/60 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Exposición base (promedio 24 h):</span>
                    <span className="font-mono font-bold text-primary">
                      {(result.pm25_promedio_24h ?? result.pm25_ica_actual).toFixed(1)} µg/m³
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-muted-foreground border-t border-border/40 pt-1">
                    <span>Lectura instantánea en vivo:</span>
                    <span className="font-mono">{result.pm25_ica_actual.toFixed(1)} µg/m³</span>
                  </div>
                  {result.n_lecturas_24h !== undefined && (
                    <div className="text-[10px] text-muted-foreground/80">
                      Observaciones en ventana: {result.n_lecturas_24h} registros
                    </div>
                  )}
                </div>
              </div>
              
              {result.nota_estimacion && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200 leading-relaxed font-sans">
                  ⚠️ {result.nota_estimacion}
                </div>
              )}
              
              <div className="pt-2 border-t border-border space-y-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Incremento de Riesgo Poblacional Atribuible
                </div>
                {result.calculos_riesgo.map((calc, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-surface/30 border border-border/50 space-y-1">
                    <div className="text-xs font-semibold text-foreground">{calc.enfermedad}</div>
                    <div className="flex justify-between items-baseline mt-1">
                      <div className="text-xs text-muted-foreground">ΔR estimado (24 h):</div>
                      <span className="text-xl font-bold text-primary">
                        +{calc.incremento_riesgo_porcentaje_actual.toFixed(2)}%
                      </span>
                    </div>

                    {/* Intervalo de confianza del 95% si existe */}
                    {calc.incremento_riesgo_inf !== undefined && calc.incremento_riesgo_inf !== null && calc.incremento_riesgo_sup !== null && (
                      <div className="flex justify-between text-[11px] text-emerald-400/90 font-mono">
                        <span>IC 95%:</span>
                        <span>[{calc.incremento_riesgo_inf.toFixed(2)}%, {calc.incremento_riesgo_sup.toFixed(2)}%]</span>
                      </div>
                    )}

                    <div className="flex justify-between text-[10px] text-muted-foreground/80 mt-1 border-t border-border/30 pt-1">
                      <span>β: {calc.beta_historico.toFixed(6)}</span>
                      {calc.incremento_riesgo_porcentaje_instantaneo !== undefined && (
                        <span>Instantáneo: +{calc.incremento_riesgo_porcentaje_instantaneo.toFixed(2)}%</span>
                      )}
                      <span>Histórico base: {calc.incremento_historico_base.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              Ingresa los datos y presiona calcular para evaluar el incremento de riesgo basado en el promedio de 24 horas.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}