import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  LayoutDashboard,
  Map as MapIcon,
  Siren,
  Users,
  ShieldCheck,
  FileLock2,
  Search,
  Plus,
  Clock,
  ArrowRight,
  Activity,
  Dot,
  Database,
  Settings,
  LogOut,
  UserCircle2,
} from "lucide-react";

/**
 * Prototipo funcional (front-end) de CAD Arbiol.
 * - Pantallas: Operación (Incidentes+Mapa+Unidades), Analítica, Evidencias, Administración.
 * - Funciones demo: crear incidente, asignar unidad, cambiar estados, timeline/auditoría, filtros.
 *
 * Nota: Es un prototipo UI/UX; los datos viven en memoria (state).
 */

// ------------------------- Tipos -------------------------
type Severity = "CRITICO" | "ALTO" | "MEDIO" | "BAJO";
type IncidentStatus = "NUEVO" | "CLASIFICADO" | "ASIGNADO" | "EN_CAMINO" | "EN_SITIO" | "CERRADO";
type UnitStatus = "DISPONIBLE" | "ASIGNADA" | "EN_CAMINO" | "EN_SITIO" | "NO_DISPONIBLE";

type TimelineEvent = {
  id: string;
  ts: number;
  actor: string;
  action: string;
  detail?: string;
};

type Evidence = {
  id: string;
  incidentId: string;
  name: string;
  type: "IMAGEN" | "VIDEO" | "PDF";
  hash: string;
  createdAt: number;
  createdBy: string;
};

type Incident = {
  id: string;
  folio: string;
  title: string;
  type: string;
  severity: Severity;
  status: IncidentStatus;
  sector: string;
  location: string;
  createdAt: number;
  slaMin: number;
  description?: string;
  assignedUnitId?: string;
};

type Unit = {
  id: string;
  callsign: string;
  agency: "SSC" | "PC" | "TRANSITO";
  status: UnitStatus;
  sector: string;
  lastKnown: string;
};

// ------------------------- Utilidades -------------------------
const now = () => Date.now();
const rid = () => Math.random().toString(16).slice(2) + "_" + Math.random().toString(16).slice(2);

const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(ts);

const minutesSince = (ts: number) => Math.max(0, Math.round((now() - ts) / 60000));

function pseudoHash(name: string, ts: number) {
  // hash demo (NO criptográfico)
  const base = `${name}|${ts}|${name.length}`;
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + "-" + rid().slice(0, 12);
}

function sevColor(sev: Severity) {
  switch (sev) {
    case "CRITICO":
      return "bg-red-600";
    case "ALTO":
      return "bg-red-500";
    case "MEDIO":
      return "bg-slate-600";
    case "BAJO":
      return "bg-slate-500";
  }
}

function statusBadge(status: IncidentStatus) {
  const map: Record<IncidentStatus, { label: string; variant?: any }> = {
    NUEVO: { label: "Nuevo" },
    CLASIFICADO: { label: "Clasificado" },
    ASIGNADO: { label: "Asignado" },
    EN_CAMINO: { label: "En camino" },
    EN_SITIO: { label: "En sitio" },
    CERRADO: { label: "Cerrado" },
  };
  return <Badge variant={status === "CERRADO" ? "secondary" : "default"}>{map[status].label}</Badge>;
}

// ------------------------- Datos iniciales -------------------------
const INCIDENT_TYPES = [
  "Robo a comercio",
  "Robo de vehículo",
  "Persona sospechosa",
  "Violencia familiar",
  "Accidente vial",
  "Emergencia médica",
  "Incendio",
];
const SECTORS = ["Centro", "Norte", "Sur", "Oriente", "Poniente"];

const seedIncidents = (): Incident[] => {
  const base = now();
  return [
    {
      id: "inc_1",
      folio: "CDMX-2026-000341",
      title: "Robo a comercio (tienda conveniencia)",
      type: "Robo a comercio",
      severity: "ALTO",
      status: "CLASIFICADO",
      sector: "Centro",
      location: "Av. Juárez 120, Centro",
      createdAt: base - 18 * 60000,
      slaMin: 20,
      description: "Reporte vía operador. Sospechoso huyó rumbo poniente.",
    },
    {
      id: "inc_2",
      folio: "CDMX-2026-000342",
      title: "Accidente vial con lesionados",
      type: "Accidente vial",
      severity: "CRITICO",
      status: "ASIGNADO",
      sector: "Oriente",
      location: "Calz. Ignacio Zaragoza km 7",
      createdAt: base - 9 * 60000,
      slaMin: 10,
      assignedUnitId: "u_3",
      description: "Dos vehículos, posible lesionado. Tránsito y PC.",
    },
    {
      id: "inc_3",
      folio: "CDMX-2026-000343",
      title: "Persona sospechosa merodeando",
      type: "Persona sospechosa",
      severity: "MEDIO",
      status: "NUEVO",
      sector: "Sur",
      location: "Insurgentes Sur 3000",
      createdAt: base - 3 * 60000,
      slaMin: 30,
      description: "Evento sugerido por analítica de video (demo).",
    },
  ];
};

const seedUnits = (): Unit[] => [
  { id: "u_1", callsign: "SSC-Delta-12", agency: "SSC", status: "DISPONIBLE", sector: "Centro", lastKnown: "Eje Central" },
  { id: "u_2", callsign: "SSC-Delta-18", agency: "SSC", status: "DISPONIBLE", sector: "Centro", lastKnown: "Bellas Artes" },
  { id: "u_3", callsign: "TRANSITO-Tau-07", agency: "TRANSITO", status: "ASIGNADA", sector: "Oriente", lastKnown: "Zaragoza" },
  { id: "u_4", callsign: "PC-Rescate-03", agency: "PC", status: "DISPONIBLE", sector: "Oriente", lastKnown: "Iztapalapa" },
  { id: "u_5", callsign: "SSC-Alpha-21", agency: "SSC", status: "NO_DISPONIBLE", sector: "Sur", lastKnown: "Tlalpan" },
];

const seedTimeline = (): Record<string, TimelineEvent[]> => {
  const base = now();
  return {
    inc_1: [
      { id: rid(), ts: base - 18 * 60000, actor: "Operador 07", action: "Incidente creado", detail: "Captura manual" },
      { id: rid(), ts: base - 16 * 60000, actor: "Supervisor", action: "Clasificación", detail: "Tipo: Robo a comercio | Severidad: ALTO" },
    ],
    inc_2: [
      { id: rid(), ts: base - 9 * 60000, actor: "Operador 02", action: "Incidente creado", detail: "Captura manual" },
      { id: rid(), ts: base - 8 * 60000, actor: "Despacho", action: "Unidad asignada", detail: "TRANSITO-Tau-07" },
    ],
    inc_3: [{ id: rid(), ts: base - 3 * 60000, actor: "AVAI-VISION", action: "Incidente sugerido", detail: "Regla: merodeo" }],
  };
};

// ------------------------- UI: Layout -------------------------
function Sidebar({ active, onNavigate }: { active: string; onNavigate: (k: string) => void }) {
  const items = [
    { k: "ops", label: "Operación", icon: Siren },
    { k: "analytics", label: "Analítica", icon: LayoutDashboard },
    { k: "evidence", label: "Evidencias", icon: FileLock2 },
    { k: "admin", label: "Administración", icon: Settings },
  ];

  return (
    <div className="w-64 shrink-0 border-r bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-600/15 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Arbiol Visión AI</div>
            <div className="text-xs text-muted-foreground">CAD Prototype</div>
          </div>
        </div>
      </div>
      <div className="px-2">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.k;
          return (
            <button
              key={it.k}
              onClick={() => onNavigate(it.k)}
              className={
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition " +
                (isActive ? "bg-blue-600 text-white" : "hover:bg-muted")
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{it.label}</span>
              <ArrowRight className={"h-4 w-4 opacity-70 " + (isActive ? "opacity-100" : "opacity-0")} />
            </button>
          );
        })}
      </div>
      <div className="mt-auto p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserCircle2 className="h-4 w-4" />
          <span>Operador demo</span>
        </div>
        <Button variant="ghost" className="mt-2 w-full justify-start gap-2" disabled>
          <LogOut className="h-4 w-4" /> Salir
        </Button>
      </div>
    </div>
  );
}

function Topbar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-6 py-4 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">Prototipo UI/UX con lógica de flujo (sin backend)</div>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

// ------------------------- Pantalla Operación -------------------------
function OpsScreen({
  incidents,
  units,
  timeline,
  evidences,
  onCreateIncident,
  onSelect,
  selectedId,
  onAssign,
  onIncidentStatus,
  onUnitStatus,
  onAddEvidence,
}: {
  incidents: Incident[];
  units: Unit[];
  timeline: Record<string, TimelineEvent[]>;
  evidences: Evidence[];
  onCreateIncident: (i: Omit<Incident, "id" | "folio" | "createdAt" | "status">) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
  onAssign: (incidentId: string, unitId: string) => void;
  onIncidentStatus: (incidentId: string, status: IncidentStatus, actor?: string) => void;
  onUnitStatus: (unitId: string, status: UnitStatus) => void;
  onAddEvidence: (incidentId: string, name: string, type: Evidence["type"]) => void;
}) {
  const selected = incidents.find((i) => i.id === selectedId) ?? incidents[0];

  const [q, setQ] = useState("");
  const [sev, setSev] = useState<Severity | "ALL">("ALL");
  const [sec, setSec] = useState<string | "ALL">("ALL");
  const [showOnlyOpen, setShowOnlyOpen] = useState(true);

  const filtered = useMemo(() => {
    return incidents
      .filter((i) => (showOnlyOpen ? i.status !== "CERRADO" : true))
      .filter((i) => (sev === "ALL" ? true : i.severity === sev))
      .filter((i) => (sec === "ALL" ? true : i.sector === sec))
      .filter((i) => {
        const s = `${i.folio} ${i.title} ${i.type} ${i.location}`.toLowerCase();
        return s.includes(q.toLowerCase());
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [incidents, q, sev, sec, showOnlyOpen]);

  const unitOptions = units.filter((u) => u.status === "DISPONIBLE" || u.status === "NO_DISPONIBLE");
  const incidentEvidences = evidences.filter((e) => e.incidentId === selected?.id);

  return (
    <div className="p-6 grid grid-cols-12 gap-4">
      {/* Left: Incidents */}
      <Card className="col-span-12 xl:col-span-4">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Siren className="h-5 w-5" /> Incidentes
            </CardTitle>
            <CreateIncidentDialog onCreate={onCreateIncident} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Buscar folio, tipo, ubicación…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={sev} onValueChange={(v) => setSev(v as any)}>
              <SelectTrigger><SelectValue placeholder="Severidad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="CRITICO">Crítico</SelectItem>
                <SelectItem value="ALTO">Alto</SelectItem>
                <SelectItem value="MEDIO">Medio</SelectItem>
                <SelectItem value="BAJO">Bajo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sec} onValueChange={(v) => setSec(v as any)}>
              <SelectTrigger><SelectValue placeholder="Sector" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={showOnlyOpen} onCheckedChange={setShowOnlyOpen} />
              <Label className="text-xs">Solo abiertos</Label>
            </div>
            <div className="text-xs text-muted-foreground">{filtered.length} resultados</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.map((i) => {
            const isSel = selected?.id === i.id;
            const mins = minutesSince(i.createdAt);
            const slaLeft = Math.max(0, i.slaMin - mins);
            const slaRisk = slaLeft <= 3 && i.status !== "CERRADO";
            return (
              <button
                key={i.id}
                onClick={() => onSelect(i.id)}
                className={
                  "w-full text-left p-3 rounded-2xl border transition " +
                  (isSel ? "border-blue-600 bg-blue-600/5" : "hover:bg-muted")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{i.folio}</div>
                    <div className="font-medium leading-snug">{i.title}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={"px-2 py-0.5 rounded-full text-[10px] text-white " + sevColor(i.severity)}>{i.severity}</span>
                    <div className={"text-[10px] flex items-center gap-1 " + (slaRisk ? "text-red-600" : "text-muted-foreground")}>
                      <Clock className="h-3 w-3" />
                      SLA {slaLeft}m
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{i.sector} • {i.type}</div>
                  <div className="text-xs">{statusBadge(i.status)}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-sm text-muted-foreground">Sin coincidencias.</div>}
        </CardContent>
      </Card>

      {/* Middle: Map placeholder + actions */}
      <Card className="col-span-12 xl:col-span-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="h-5 w-5" /> Mapa operativo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{selected?.sector} — {selected?.location}</div>
                <div className="text-xs text-muted-foreground">(Placeholder) Aquí va mapa: cuadrantes, cámaras, unidades AVL.</div>
              </div>
              <Badge variant="secondary">Demo</Badge>
            </div>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-background p-3 border">
                <div className="text-muted-foreground">Cámaras cercanas</div>
                <div className="mt-1 font-semibold">8</div>
              </div>
              <div className="rounded-xl bg-background p-3 border">
                <div className="text-muted-foreground">Unidades cercanas</div>
                <div className="mt-1 font-semibold">3</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Acciones rápidas</div>
              <div className="text-xs text-muted-foreground">Bitácora automática</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => selected && onIncidentStatus(selected.id, "CLASIFICADO", "Supervisor")}
                disabled={!selected || selected.status === "CERRADO"}
              >
                Clasificar
              </Button>
              <Button
                variant="secondary"
                onClick={() => selected && onIncidentStatus(selected.id, "EN_CAMINO", "Despacho")}
                disabled={!selected || !selected.assignedUnitId || selected.status === "CERRADO"}
              >
                En camino
              </Button>
              <Button
                variant="secondary"
                onClick={() => selected && onIncidentStatus(selected.id, "EN_SITIO", "Unidad")}
                disabled={!selected || selected.status === "CERRADO"}
              >
                En sitio
              </Button>
              <Button
                onClick={() => selected && onIncidentStatus(selected.id, "CERRADO", "Supervisor")}
                disabled={!selected || selected.status === "CERRADO"}
              >
                Cerrar
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Evidencia (demo)</div>
              <AddEvidenceDialog onAdd={(name, type) => selected && onAddEvidence(selected.id, name, type)} disabled={!selected || selected.status === "CERRADO"} />
            </div>
            <div className="mt-3 space-y-2">
              {incidentEvidences.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.type} • Hash {e.hash.slice(0, 12)}… • {fmtTime(e.createdAt)}</div>
                  </div>
                  <Badge variant="secondary">Custodia</Badge>
                </div>
              ))}
              {incidentEvidences.length === 0 && <div className="text-sm text-muted-foreground">Sin evidencias anexadas.</div>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: Detail + Units + Timeline */}
      <Card className="col-span-12 xl:col-span-3">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Detalle
          </CardTitle>
          {selected && (
            <div className="text-xs text-muted-foreground">
              {selected.folio} • {fmtTime(selected.createdAt)} • SLA {selected.slaMin}m
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Selecciona un incidente.</div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold leading-snug">{selected.title}</div>
                    <div className="text-xs text-muted-foreground">{selected.type} • {selected.sector}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={"px-2 py-0.5 rounded-full text-[10px] text-white " + sevColor(selected.severity)}>{selected.severity}</span>
                    {statusBadge(selected.status)}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{selected.location}</div>
                {selected.description && <div className="text-sm">{selected.description}</div>}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-semibold flex items-center justify-between">
                  <span>Asignación</span>
                  <Badge variant="secondary">{selected.assignedUnitId ? "Asignado" : "Pendiente"}</Badge>
                </div>

                <AssignUnit
                  selectedIncident={selected}
                  units={unitOptions}
                  onAssign={(unitId) => onAssign(selected.id, unitId)}
                  onUnitStatus={onUnitStatus}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-semibold">Timeline / Auditoría</div>
                <div className="space-y-2">
                  {(timeline[selected.id] ?? []).slice().sort((a, b) => b.ts - a.ts).map((ev) => (
                    <div key={ev.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium flex items-center gap-1">
                          <Dot className="h-4 w-4" /> {ev.action}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{fmtTime(ev.ts)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{ev.actor}</div>
                      {ev.detail && <div className="text-sm mt-1">{ev.detail}</div>}
                    </div>
                  ))}
                  {(timeline[selected.id] ?? []).length === 0 && <div className="text-sm text-muted-foreground">Sin eventos.</div>}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bottom: Units list */}
      <Card className="col-span-12">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Unidades
          </CardTitle>
          <div className="text-xs text-muted-foreground">Estados simulados (demo)</div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {units.map((u) => (
            <div key={u.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{u.callsign}</div>
                  <div className="text-xs text-muted-foreground">{u.agency} • {u.sector}</div>
                </div>
                <Badge variant={u.status === "DISPONIBLE" ? "default" : "secondary"}>{u.status}</Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">Último: {u.lastKnown}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" onClick={() => onUnitStatus(u.id, "DISPONIBLE")}>Disponible</Button>
                <Button size="sm" variant="secondary" onClick={() => onUnitStatus(u.id, "NO_DISPONIBLE")}>No disp.</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AssignUnit({
  selectedIncident,
  units,
  onAssign,
  onUnitStatus,
}: {
  selectedIncident: Incident;
  units: Unit[];
  onAssign: (unitId: string) => void;
  onUnitStatus: (unitId: string, status: UnitStatus) => void;
}) {
  const suggested = useMemo(() => {
    // sugerencia demo: preferir misma zona + disponible
    const same = units.filter((u) => u.sector === selectedIncident.sector && u.status === "DISPONIBLE");
    if (same.length) return same[0];
    const any = units.filter((u) => u.status === "DISPONIBLE");
    return any[0];
  }, [units, selectedIncident.sector]);

  const current = selectedIncident.assignedUnitId;

  return (
    <div className="space-y-2">
      {current ? (
        <div className="rounded-xl border p-3">
          <div className="text-sm">Unidad asignada: <span className="font-semibold">{current}</span></div>
          <div className="text-xs text-muted-foreground">(Demo) Aquí mostraríamos callsign real, ETA, AVL.</div>
        </div>
      ) : (
        <div className="rounded-xl border p-3">
          <div className="text-sm text-muted-foreground">Sin unidad asignada.</div>
        </div>
      )}

      <div className="rounded-xl border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Sugerencia</div>
          <Badge variant="secondary">Rule-based</Badge>
        </div>
        {suggested ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{suggested.callsign}</div>
              <div className="text-xs text-muted-foreground">{suggested.agency} • {suggested.sector} • {suggested.status}</div>
            </div>
            <Button size="sm" onClick={() => { onAssign(suggested.id); onUnitStatus(suggested.id, "ASIGNADA"); }}>
              Asignar
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sin unidades sugeridas.</div>
        )}
      </div>

      <div className="rounded-xl border p-3 space-y-2">
        <div className="text-sm font-semibold">Asignación manual</div>
        <div className="grid grid-cols-2 gap-2">
          {units.filter((u) => u.status === "DISPONIBLE").slice(0, 4).map((u) => (
            <Button
              key={u.id}
              variant="secondary"
              size="sm"
              onClick={() => {
                onAssign(u.id);
                onUnitStatus(u.id, "ASIGNADA");
              }}
            >
              {u.callsign}
            </Button>
          ))}
        </div>
        {units.filter((u) => u.status === "DISPONIBLE").length === 0 && (
          <div className="text-sm text-muted-foreground">No hay unidades disponibles.</div>
        )}
      </div>
    </div>
  );
}

function CreateIncidentDialog({
  onCreate,
}: {
  onCreate: (i: Omit<Incident, "id" | "folio" | "createdAt" | "status">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState(INCIDENT_TYPES[0]);
  const [severity, setSeverity] = useState<Severity>("MEDIO");
  const [sector, setSector] = useState(SECTORS[0]);
  const [location, setLocation] = useState("");
  const [slaMin, setSlaMin] = useState(20);
  const [desc, setDesc] = useState("");

  const canSave = title.trim().length > 3 && location.trim().length > 5;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nuevo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Crear incidente (demo)</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Robo a comercio…" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Severidad</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CRITICO">Crítico</SelectItem>
                <SelectItem value="ALTO">Alto</SelectItem>
                <SelectItem value="MEDIO">Medio</SelectItem>
                <SelectItem value="BAJO">Bajo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sector</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">SLA (min)</Label>
            <Input type="number" value={slaMin} onChange={(e) => setSlaMin(parseInt(e.target.value || "0", 10))} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Ubicación</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Calle y número, colonia…" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Descripción</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Detalles operativos…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              onCreate({ title, type, severity, sector, location, slaMin, description: desc });
              setOpen(false);
              setTitle("");
              setLocation("");
              setDesc("");
            }}
            disabled={!canSave}
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEvidenceDialog({ onAdd, disabled }: { onAdd: (name: string, type: Evidence["type"]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<Evidence["type"]>("IMAGEN");
  const can = name.trim().length > 2;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled} className="gap-2">
          <Plus className="h-4 w-4" /> Anexar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anexar evidencia (demo)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Clip cámara 12" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IMAGEN">Imagen</SelectItem>
                <SelectItem value="VIDEO">Video</SelectItem>
                <SelectItem value="PDF">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!can}
            onClick={() => {
              onAdd(name, type);
              setOpen(false);
              setName("");
              setType("IMAGEN");
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------- Pantalla Analítica -------------------------
function AnalyticsScreen({ incidents }: { incidents: Incident[] }) {
  const open = incidents.filter((i) => i.status !== "CERRADO");
  const avgDispatch = 4.8; // demo

  const bySector = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of incidents) m[i.sector] = (m[i.sector] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [incidents]);

  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of incidents) m[i.type] = (m[i.type] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [incidents]);

  return (
    <div className="p-6 space-y-4">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Incidentes activos</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{open.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Tiempo promedio despacho</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{avgDispatch}m</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Cumplimiento SLA</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">96%</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Eventos IA sugeridos</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">3</CardContent>
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Incidentes por sector</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {bySector.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl border p-3">
                <div className="text-sm font-medium">{k}</div>
                <Badge variant="secondary">{v}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Incidentes por tipo</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {byType.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl border p-3">
                <div className="text-sm font-medium">{k}</div>
                <Badge variant="secondary">{v}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Notas</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Este tablero es demo. En versión productiva: series temporales, heatmaps, saturación por turno, comparativos por municipio, exportaciones.
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------- Evidencias -------------------------
function EvidenceScreen({ evidences, incidents }: { evidences: Evidence[]; incidents: Incident[] }) {
  const incById = useMemo(() => Object.fromEntries(incidents.map((i) => [i.id, i])), [incidents]);
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileLock2 className="h-5 w-5" /> Evidencias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {evidences.slice().sort((a, b) => b.createdAt - a.createdAt).map((e) => (
            <div key={e.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{e.type} • Hash {e.hash} • {fmtTime(e.createdAt)}</div>
                  <div className="text-xs text-muted-foreground">Incidente: {incById[e.incidentId]?.folio} — {incById[e.incidentId]?.title}</div>
                </div>
                <Badge variant="secondary">Custodia</Badge>
              </div>
            </div>
          ))}
          {evidences.length === 0 && <div className="text-sm text-muted-foreground">No hay evidencias.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------- Admin -------------------------
function AdminScreen() {
  return (
    <div className="p-6 space-y-4">
      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Catálogos (demo)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="rounded-2xl border p-4">
              <div className="font-medium text-foreground">Tipos de incidente</div>
              <div className="mt-2">{INCIDENT_TYPES.join(" • ")}</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="font-medium text-foreground">Sectores</div>
              <div className="mt-2">{SECTORS.join(" • ")}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Motor de reglas (demo)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-semibold">Regla: Escalamiento SLA 70%</div>
              <div className="text-xs text-muted-foreground mt-1">Si SLA consumido ≥ 70% y status ≠ Cerrado → notificar supervisor.</div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Habilitada</div>
                <Switch defaultChecked />
              </div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-semibold">Regla: Cierre requiere evidencia</div>
              <div className="text-xs text-muted-foreground mt-1">Para tipos críticos → bloquear cierre si no hay evidencia.</div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Habilitada</div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Nota</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          En versión productiva esta pantalla incluye: RBAC/roles, control de cambios, versionado de reglas, bitácora de configuración, y auditoría.
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------- App Root -------------------------
export default function App() {
  const [route, setRoute] = useState<"ops" | "analytics" | "evidence" | "admin">("ops");

  const [incidents, setIncidents] = useState<Incident[]>(seedIncidents);
  const [units, setUnits] = useState<Unit[]>(seedUnits);
  const [timeline, setTimeline] = useState<Record<string, TimelineEvent[]>>(seedTimeline);
  const [evidences, setEvidences] = useState<Evidence[]>(() => {
    const t = now() - 12 * 60000;
    return [
      {
        id: "ev_1",
        incidentId: "inc_2",
        name: "Foto preliminar (demo)",
        type: "IMAGEN",
        hash: pseudoHash("Foto preliminar", t),
        createdAt: t,
        createdBy: "Operador 02",
      },
    ];
  });

  const [selectedId, setSelectedId] = useState<string | undefined>("inc_1");

  // Timeline helper
  const pushEvent = (incidentId: string, actor: string, action: string, detail?: string) => {
    setTimeline((prev) => {
      const next = { ...prev };
      const arr = next[incidentId] ? [...next[incidentId]] : [];
      arr.push({ id: rid(), ts: now(), actor, action, detail });
      next[incidentId] = arr;
      return next;
    });
  };

  const onCreateIncident = (data: Omit<Incident, "id" | "folio" | "createdAt" | "status">) => {
    const id = "inc_" + rid();
    const folio = `CDMX-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const inc: Incident = {
      id,
      folio,
      createdAt: now(),
      status: "NUEVO",
      ...data,
    };
    setIncidents((prev) => [inc, ...prev]);
    pushEvent(id, "Operador demo", "Incidente creado", `Tipo: ${inc.type} | Sev: ${inc.severity}`);
    setSelectedId(id);
  };

  const onAssign = (incidentId: string, unitId: string) => {
    setIncidents((prev) =>
      prev.map((i) => (i.id === incidentId ? { ...i, assignedUnitId: unitId, status: i.status === "NUEVO" ? "ASIGNADO" : "ASIGNADO" } : i))
    );
    const u = units.find((x) => x.id === unitId);
    pushEvent(incidentId, "Despacho", "Unidad asignada", u ? u.callsign : unitId);
  };

  const onIncidentStatus = (incidentId: string, status: IncidentStatus, actor = "Sistema") => {
    setIncidents((prev) =>
      prev.map((i) => {
        if (i.id !== incidentId) return i;
        // Si cierra, también marcar unidad como disponible (demo)
        return { ...i, status };
      })
    );
    pushEvent(incidentId, actor, "Cambio de estado", status);

    if (status === "CERRADO") {
      const inc = incidents.find((x) => x.id === incidentId);
      if (inc?.assignedUnitId) {
        setUnits((prev) => prev.map((u) => (u.id === inc.assignedUnitId ? { ...u, status: "DISPONIBLE" } : u)));
      }
    }
  };

  const onUnitStatus = (unitId: string, status: UnitStatus) => {
    setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, status } : u)));
  };

  const onAddEvidence = (incidentId: string, name: string, type: Evidence["type"]) => {
    const ts = now();
    const ev: Evidence = {
      id: "ev_" + rid(),
      incidentId,
      name,
      type,
      hash: pseudoHash(name, ts),
      createdAt: ts,
      createdBy: "Operador demo",
    };
    setEvidences((prev) => [ev, ...prev]);
    pushEvent(incidentId, "Operador demo", "Evidencia anexada", `${type}: ${name} | Hash ${ev.hash.slice(0, 12)}…`);
  };

  const title = route === "ops" ? "Operación" : route === "analytics" ? "Analítica" : route === "evidence" ? "Evidencias" : "Administración";

  return (
    <div className="min-h-screen flex">
      <Sidebar active={route} onNavigate={(k) => setRoute(k as any)} />
      <div className="flex-1 flex flex-col">
        <Topbar
          title={title}
          right={
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1"><Dot className="h-3 w-3" /> Demo</Badge>
              <Badge className="bg-blue-600">AVAI-CAD</Badge>
            </div>
          }
        />

        {route === "ops" && (
          <OpsScreen
            incidents={incidents}
            units={units}
            timeline={timeline}
            evidences={evidences}
            onCreateIncident={onCreateIncident}
            onSelect={setSelectedId}
            selectedId={selectedId}
            onAssign={onAssign}
            onIncidentStatus={onIncidentStatus}
            onUnitStatus={onUnitStatus}
            onAddEvidence={onAddEvidence}
          />
        )}
        {route === "analytics" && <AnalyticsScreen incidents={incidents} />}
        {route === "evidence" && <EvidenceScreen evidences={evidences} incidents={incidents} />}
        {route === "admin" && <AdminScreen />}
      </div>
    </div>
  );
}
