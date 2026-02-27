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
type Role = "OPERADOR" | "SUPERVISOR" | "COORDINADOR" | "ADMIN_TI";

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


function LoginCard({
  defaultName,
  defaultRole,
  onLogin,
  logoSrc,
}: {
  defaultName: string;
  defaultRole: Role;
  onLogin: (name: string, role: Role) => void;
  logoSrc?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<Role>(defaultRole);

  const can = name.trim().length >= 3;

  return (
    <Card className="w-full max-w-md rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl overflow-hidden border bg-muted flex items-center justify-center">
            <img src={logoSrc ?? "/arbiol-logo.png"} alt="Arbiol" className="h-12 w-12 object-contain" />
          </div>
          <div>
            <CardTitle>AVAI-CAD</CardTitle>
            <div className="text-xs text-muted-foreground">Arbiol Visión AI • Acceso</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Operador 07" />
        </div>

        <div>
          <Label className="text-xs">Rol</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPERADOR">Operador</SelectItem>
              <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
              <SelectItem value="COORDINADOR">Coordinador</SelectItem>
              <SelectItem value="ADMIN_TI">Administrador (TI)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full" disabled={!can} onClick={() => onLogin(name.trim(), role)}>
          Entrar
        </Button>

        <div className="text-xs text-muted-foreground">
          Demo sin backend: la sesión es local. En piloto real se conecta a RBAC/SSO.
        </div>
      </CardContent>
    </Card>
  );
}

function IASuggestionsPanel({
  incident,
  units,
  timeline,
  evidences,
  onConfirm,
  onAssign,
  onClassify,
}: {
  incident: Incident;
  units: Unit[];
  timeline: TimelineEvent[];
  evidences: Evidence[];
  onConfirm: (label: string, apply: () => void) => void;
  onAssign: (unitId: string) => void;
  onClassify: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pendingLabel, setPendingLabel] = React.useState<string>("");
  const [pendingApply, setPendingApply] = React.useState<null | (() => void)>(null);

  // Señales “simuladas” desde timeline (AVAI-VISION)
  const signals = React.useMemo(() => {
    return timeline
      .filter((t) => (t.actor ?? "").toUpperCase().includes("AVAI"))
      .map((t) => t.detail || t.action)
      .filter(Boolean)
      .slice(0, 5) as string[];
  }, [timeline]);

  // Sugerencia de unidad: misma zona + disponible
  const suggestedUnit = React.useMemo(() => {
    const same = units.find((u) => u.sector === incident.sector && u.status === "DISPONIBLE");
    if (same) return same;
    return units.find((u) => u.status === "DISPONIBLE");
  }, [units, incident.sector]);

  const recs = React.useMemo(() => {
    const out: { title: string; desc: string; cta?: { label: string; apply: () => void } }[] = [];

    // 1) Clasificación sugerida
    if (incident.status === "NUEVO") {
      out.push({
        title: "Clasificar incidente",
        desc: "Sugerencia IA: confirmar tipo/severidad y mover a CLASIFICADO para despacho.",
        cta: { label: "Aplicar: Clasificar", apply: onClassify },
      });
    }

    // 2) Unidad sugerida
    if (!incident.assignedUnitId && suggestedUnit) {
      out.push({
        title: "Unidad sugerida",
        desc: `Sugerencia IA: asignar ${suggestedUnit.callsign} (${suggestedUnit.agency}) por proximidad/sector.`,
        cta: { label: `Aplicar: Asignar ${suggestedUnit.callsign}`, apply: () => onAssign(suggestedUnit.id) },
      });
    }

    // 3) Evidencia recomendada (por señales)
    if (incident.severity === "CRITICO" && evidences.length === 0) {
      out.push({
        title: "Evidencia recomendada",
        desc: "Sugerencia IA: anexar evidencia mínima (foto/video) antes de cierre o escalamiento.",
      });
    }

    // 4) Señales de video (B)
    if (signals.length > 0) {
      out.push({
        title: "Señales AVAI-VISION",
        desc: signals.join(" • "),
      });
    } else {
      out.push({
        title: "Señales AVAI-VISION",
        desc: "Sin señales de video asociadas (demo).",
      });
    }

    return out;
  }, [incident, suggestedUnit, evidences.length, signals, onAssign, onClassify]);

  const requestConfirm = (label: string, apply: () => void) => {
    setPendingLabel(label);
    setPendingApply(() => apply);
    setOpen(true);
  };

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Sugerencias IA (demo)</div>
        <Badge variant="secondary">Recomendación</Badge>
      </div>

      <div className="space-y-2">
        {recs.map((r, idx) => (
          <div key={idx} className="rounded-xl border p-3">
            <div className="text-sm font-medium">{r.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
            {r.cta && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => requestConfirm(r.cta!.label, r.cta!.apply)}
              >
                {r.cta.label}
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar acción sugerida</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            ¿Deseas aplicar esta sugerencia?
            <div className="mt-2 font-medium text-foreground">{pendingLabel}</div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (pendingApply) onConfirm(pendingLabel, pendingApply);
                setOpen(false);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DispatchPanel(props: {
  incidents: Incident[];
  units: Unit[];
  evidences?: Evidence[];
  timeline?: Record<string, TimelineEvent[]>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onAssign: (incidentId: string, unitId: string) => void;
  onUnitStatus: (unitId: string, status: UnitStatus) => void;
  onAuditEvent?: (incidentId: string, action: string, detail?: string) => void;
}) {
  const { incidents, units, selectedId, onSelect, onAssign, onUnitStatus } = props;
  const evidences: Evidence[] = props.evidences ?? [];
  const timeline: Record<string, TimelineEvent[]> = props.timeline ?? {};

  const queue = useMemo(() => {
    const sevRank: Record<Severity, number> = { CRITICO: 4, ALTO: 3, MEDIO: 2, BAJO: 1 };
    return incidents
      .filter((i) => i.status !== "CERRADO")
      .slice()
      .sort((a, b) => {
        const r = sevRank[b.severity] - sevRank[a.severity];
        if (r !== 0) return r;
        return minutesSince(b.createdAt) - minutesSince(a.createdAt);
      });
  }, [incidents]);

  const available = units.filter((u) => u.status === "DISPONIBLE");

  const selected = incidents.find((i) => i.id === selectedId) ?? queue[0];

  const etaFor = (unitId: string, incidentId: string) => {
    // ETA demo: mismo sector => 4-7min; diferente => 8-14min
    const u = units.find((x) => x.id === unitId);
    const inc = incidents.find((x) => x.id === incidentId);
    if (!u || !inc) return 0;
    const same = u.sector === inc.sector;
    const base = same ? 4 : 8;
    const jitter = (unitId.length * 3 + incidentId.length) % (same ? 4 : 7);
    return base + jitter;
  };

  const exportSelectedCSV = () => {
    if (!selected) return;
    const rows: string[][] = [];
    const incidentEvidences = (props.evidences ?? []).filter((e) => e.incidentId === selected.id);
    rows.push(["Folio", selected.folio]);
    rows.push(["Título", selected.title]);
    rows.push(["Tipo", selected.type]);
    rows.push(["Severidad", selected.severity]);
    rows.push(["Estado", selected.status]);
    rows.push(["Sector", selected.sector]);
    rows.push(["Ubicación", selected.location]);
    rows.push(["Creado", fmtTime(selected.createdAt)]);
    rows.push(["SLA (min)", String(selected.slaMin)]);
    rows.push(["Unidad asignada", selected.assignedUnitId ?? ""]);
    rows.push(["Descripción", selected.description ?? ""]);
    rows.push([]);
    rows.push(["EVIDENCIAS"]);
    rows.push(["Nombre", "Tipo", "Hash", "Fecha"]);
    for (const e of incidentEvidences.slice().sort((a, b) => a.createdAt - b.createdAt)) {
      rows.push([e.name, e.type, e.hash, fmtTime(e.createdAt)]);
    }
    rows.push([]);
    rows.push(["BITÁCORA"]);
    rows.push(["Fecha", "Actor", "Acción", "Detalle"]);
    for (const ev of (timeline[selected.id] ?? []).slice().sort((a, b) => a.ts - b.ts)) {
      rows.push([fmtTime(ev.ts), ev.actor, ev.action, ev.detail ?? ""]);
    }

    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            const v = (c ?? "").toString().replace(/"/g, '""');
            return `"${v}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.folio}_incidente.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    (props.onAuditEvent ?? (() => {}))(selected.id, "Exportación CSV", "Se exportó CSV del incidente.");
  };

  const printSelectedPDF = () => {
    if (!selected) return;
    const incidentEvidences = (props.evidences ?? []).filter((e) => e.incidentId === selected.id);
    const w = window.open("", "_blank");
    if (!w) return;
    const evs = incidentEvidences.slice().sort((a, b) => a.createdAt - b.createdAt);
    const bits = (timeline[selected.id] ?? []).slice().sort((a, b) => a.ts - b.ts);

    w.document.write(`
      <html>
      <head>
        <title>${selected.folio} - AVAI-CAD</title>
        <meta charset="utf-8"/>
        <style>
          body{ font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; padding:24px; }
          h1{ font-size:18px; margin:0 0 8px 0; }
          .muted{ color:#666; font-size:12px; }
          .box{ border:1px solid #ddd; border-radius:12px; padding:12px; margin:12px 0; }
          table{ width:100%; border-collapse:collapse; }
          th,td{ border-bottom:1px solid #eee; padding:8px; font-size:12px; text-align:left; vertical-align:top; }
          th{ background:#fafafa; }
          .tag{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; border:1px solid #ddd; }
        </style>
      </head>
      <body>
        <h1>Incidente ${selected.folio}</h1>
        <div class="muted">AVAI-CAD | Arbiol Visión AI • Generado: ${new Date().toLocaleString("es-MX")}</div>

        <div class="box">
          <div><b>Título:</b> ${selected.title}</div>
          <div><b>Tipo:</b> ${selected.type} • <b>Severidad:</b> <span class="tag">${selected.severity}</span> • <b>Estado:</b> <span class="tag">${selected.status}</span></div>
          <div><b>Sector:</b> ${selected.sector}</div>
          <div><b>Ubicación:</b> ${selected.location}</div>
          <div><b>Creado:</b> ${new Date(selected.createdAt).toLocaleString("es-MX")} • <b>SLA:</b> ${selected.slaMin} min</div>
          <div><b>Unidad:</b> ${selected.assignedUnitId ?? ""}</div>
          <div><b>Descripción:</b> ${selected.description ?? ""}</div>
        </div>

        <div class="box">
          <h1>Evidencias</h1>
          <table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Hash</th><th>Fecha</th></tr></thead>
            <tbody>
              ${evs.map(e => `<tr><td>${e.name}</td><td>${e.type}</td><td>${e.hash}</td><td>${new Date(e.createdAt).toLocaleString("es-MX")}</td></tr>`).join("")}
              ${evs.length === 0 ? `<tr><td colspan="4" class="muted">Sin evidencias</td></tr>` : ""}
            </tbody>
          </table>
        </div>

        <div class="box">
          <h1>Bitácora / Auditoría</h1>
          <table>
            <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              ${bits.map(ev => `<tr><td>${new Date(ev.ts).toLocaleString("es-MX")}</td><td>${ev.actor}</td><td>${ev.action}</td><td>${ev.detail ?? ""}</td></tr>`).join("")}
              ${bits.length === 0 ? `<tr><td colspan="4" class="muted">Sin eventos</td></tr>` : ""}
            </tbody>
          </table>
        </div>

        <div class="muted">Nota: En despliegue productivo, la custodia se soporta con hash criptográfico, sellado y almacenamiento seguro.</div>
      </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();

    (props.onAuditEvent ?? (() => {}))(selected.id, "Impresión / PDF", "Se generó impresión del incidente.");
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Cola de despacho</div>
          <Badge variant="secondary">{queue.length} activos</Badge>
        </div>

        <div className="mt-3 space-y-2">
          {queue.map((i) => {
            const isSel = selected?.id === i.id;
            const mins = minutesSince(i.createdAt);
            const slaLeft = Math.max(0, i.slaMin - mins);
            return (
              <button
                key={i.id}
                onClick={() => onSelect(i.id)}
                className={
                  "w-full text-left rounded-2xl border p-3 transition " +
                  (isSel ? "border-blue-600 bg-blue-600/5" : "hover:bg-muted")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{i.folio}</div>
                    <div className="font-medium">{i.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.sector} • {i.type}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={"px-2 py-0.5 rounded-full text-[10px] text-white inline-block " + sevColor(i.severity)}>{i.severity}</div>
                    <div className={"mt-1 text-[10px] " + (slaLeft <= 3 ? "text-red-600" : "text-muted-foreground")}>
                      SLA {slaLeft}m
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {queue.length === 0 && <div className="text-sm text-muted-foreground">Sin incidentes activos.</div>}
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Asignación rápida</div>
          <Badge variant="secondary">{available.length} disponibles</Badge>
        </div>

        {!selected ? (
          <div className="mt-3 text-sm text-muted-foreground">Selecciona un incidente.</div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium">{selected.folio} • {selected.sector}</div>
              <div className="text-xs text-muted-foreground">{selected.location}</div>
            </div>

            <div className="grid md:grid-cols-2 gap-2">
              {available.slice(0, 6).map((u) => (
                <div key={u.id} className="rounded-xl border p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{u.callsign}</div>
                    <div className="text-xs text-muted-foreground">{u.agency} • {u.sector}</div>
                    <div className="text-xs text-muted-foreground">ETA: {etaFor(u.id, selected.id)} min</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      onAssign(selected.id, u.id);
                      onUnitStatus(u.id, "ASIGNADA");
                    }}
                  >
                    Asignar
                  </Button>
                </div>
              ))}
              {available.length === 0 && (
                <div className="text-sm text-muted-foreground">No hay unidades disponibles.</div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              En producto: AVL real, cálculo ETA, cobertura por cuadrante, y reglas por prioridad.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}









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


type CloseCheck = { ok: boolean; reason?: string };

function canCloseIncident(incident: Incident, role: Role, evidences: Evidence[]): CloseCheck {
  if (role === "ADMIN_TI") return { ok: false, reason: "Rol ADMIN_TI no opera incidentes." };

  const hasEvidence = evidences.some((e) => e.incidentId === incident.id);

  // Regla: CRÍTICO requiere evidencia
  if (incident.severity === "CRITICO" && !hasEvidence) {
    return { ok: false, reason: "Incidente CRÍTICO requiere evidencia para cierre." };
  }

  // RBAC: Operador no cierra CRÍTICOS (aun con evidencia)
  if (role === "OPERADOR" && incident.severity === "CRITICO") {
    return { ok: false, reason: "Operador no puede cerrar incidentes CRÍTICOS." };
  }

  return { ok: true };
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
function Sidebar({
  active,
  onNavigate,
  operatorName,
  role,
  onLogout,
}: {
  active: string;
  onNavigate: (k: string) => void;
  operatorName: string;
  role: Role;
  onLogout: () => void;
}) {
  const baseItems = [
    { k: "ops", label: "Operación", icon: Siren },
    { k: "analytics", label: "Analítica", icon: LayoutDashboard },
    { k: "evidence", label: "Evidencias", icon: FileLock2 },
    { k: "admin", label: "Administración", icon: Settings },
  ];

  // RBAC navegación: ADMIN_TI solo ve Administración
  const items = role === "ADMIN_TI" ? baseItems.filter((i) => i.k === "admin") : baseItems;

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
          <span>{operatorName} • {role}</span>
        </div>
        <Button variant="ghost" className="mt-2 w-full justify-start gap-2" onClick={onLogout}>
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

function MapMock({
  selectedIncident,
  units,
}: {
  selectedIncident?: Incident;
  units: Unit[];
}) {
  // Grid simple 12x8 con posiciones simuladas para unidades.
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() => {
    const p: Record<string, { x: number; y: number }> = {};
    for (const u of units) {
      // Semilla determinística por id
      const seed = Array.from(u.id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      p[u.id] = { x: (seed % 12) + 1, y: (Math.floor(seed / 7) % 8) + 1 };
    }
    return p;
  });
  const [selUnit, setSelUnit] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setPos((prev) => {
        const next = { ...prev };
        for (const u of units) {
          if (u.status === "NO_DISPONIBLE") continue;
          const cur = next[u.id] ?? { x: 6, y: 4 };
          // Movimiento pequeño (jitter)
          const dx = Math.random() < 0.5 ? -1 : 1;
          const dy = Math.random() < 0.5 ? -1 : 1;
          next[u.id] = {
            x: Math.min(12, Math.max(1, cur.x + dx)),
            y: Math.min(8, Math.max(1, cur.y + dy)),
          };
        }
        return next;
      });
    }, 1800);
    return () => clearInterval(t);
  }, [units]);

  // Punto de incidente por sector (heurística demo)
  const incidentPoint = useMemo(() => {
    if (!selectedIncident) return { x: 6, y: 4 };
    const map: Record<string, { x: number; y: number }> = {
      Centro: { x: 6, y: 4 },
      Norte: { x: 6, y: 2 },
      Sur: { x: 6, y: 7 },
      Oriente: { x: 10, y: 5 },
      Poniente: { x: 2, y: 5 },
    };
    return map[selectedIncident.sector] ?? { x: 6, y: 4 };
  }, [selectedIncident]);

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const selectedUnit = selUnit ? unitById[selUnit] : undefined;

  return (
    <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Mapa operativo (mock)</div>
          <div className="text-xs text-muted-foreground">
            Cuadrantes + unidades simuladas. Click en una unidad para ver detalle.
          </div>
        </div>
        <Badge variant="secondary">Demo</Badge>
      </div>

      <div className="rounded-2xl border bg-background p-3">
        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: 12 * 8 }).map((_, i) => (
            <div key={i} className="h-6 rounded-md bg-muted/40" />
          ))}
        </div>

        {/* Marcador de incidente */}
        <div
          className="absolute pointer-events-none"
          style={{
            transform: `translate(${(incidentPoint.x - 1) * 28}px, ${(incidentPoint.y - 1) * 28}px)`,
          }}
        />

        <div className="relative -mt-[192px] h-[192px]">
          <div
            className="absolute h-4 w-4 rounded-full bg-red-600 ring-4 ring-red-600/20"
            style={{
              left: (incidentPoint.x - 1) * 28 + 8,
              top: (incidentPoint.y - 1) * 28 + 8,
            }}
            title={selectedIncident ? `${selectedIncident.folio}` : "Incidente"}
          />

          {units.map((u) => {
            const p = pos[u.id] ?? { x: 6, y: 4 };
            const isSel = selUnit === u.id;
            return (
              <button
                key={u.id}
                onClick={() => setSelUnit(u.id)}
                className={
                  "absolute h-4 w-4 rounded-full ring-4 transition " +
                  (u.status === "DISPONIBLE"
                    ? "bg-blue-600 ring-blue-600/20"
                    : u.status === "ASIGNADA"
                    ? "bg-slate-700 ring-slate-700/20"
                    : "bg-slate-500 ring-slate-500/20") +
                  (isSel ? " scale-110" : "")
                }
                style={{
                  left: (p.x - 1) * 28 + 8,
                  top: (p.y - 1) * 28 + 8,
                }}
                title={`${u.callsign} • ${u.status}`}
              />
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-background p-3 border">
          <div className="text-muted-foreground">Incidente seleccionado</div>
          <div className="mt-1 font-semibold">{selectedIncident ? selectedIncident.folio : "—"}</div>
        </div>
        <div className="rounded-xl bg-background p-3 border">
          <div className="text-muted-foreground">Unidad seleccionada</div>
          <div className="mt-1 font-semibold">{selectedUnit ? selectedUnit.callsign : "—"}</div>
        </div>
      </div>

      {selectedUnit && (
        <div className="rounded-2xl border bg-background p-3">
          <div className="text-sm font-semibold">{selectedUnit.callsign}</div>
          <div className="text-xs text-muted-foreground">{selectedUnit.agency} • {selectedUnit.sector}</div>
          <div className="text-xs text-muted-foreground mt-1">Estado: {selectedUnit.status}</div>
          <div className="text-xs text-muted-foreground">Último: {selectedUnit.lastKnown}</div>
        </div>
      )}
    </div>
  );
}

// ------------------------- Pantalla Operación -------------------------
function OpsScreen({
  incidents,
  units,
  timeline,
  evidences,
  operatorName,
  role,
  onCreateIncident,
  onSelect,
  selectedId,
  onAssign,
  onIncidentStatus,
  onUnitStatus,
  onAddEvidence,
  onAuditEvent,
}: {
  incidents: Incident[];
  units: Unit[];
  timeline: Record<string, TimelineEvent[]>;
  evidences: Evidence[];
  operatorName: string;
  role: Role;
  onCreateIncident: (i: Omit<Incident, "id" | "folio" | "createdAt" | "status">) => void;
  onSelect: (id: string) => void;
  selectedId?: string;
  onAssign: (incidentId: string, unitId: string) => void;
  onIncidentStatus: (incidentId: string, status: IncidentStatus, actor?: string) => void;
  onUnitStatus: (unitId: string, status: UnitStatus) => void;
  onAddEvidence: (incidentId: string, name: string, type: Evidence["type"]) => void;
  onAuditEvent: (incidentId: string, action: string, detail?: string) => void;
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


  // -------- Exportaciones (Detalle) --------
  const exportSelectedCSV = () => {
    if (!selected) return;

    const incEvidences = evidences.filter((e) => e.incidentId === selected.id);
    const tline = (timeline[selected.id] ?? []).slice().sort((a, b) => a.ts - b.ts);

    const rows: string[][] = [];
    rows.push(["Folio", selected.folio]);
    rows.push(["Título", selected.title]);
    rows.push(["Tipo", selected.type]);
    rows.push(["Severidad", selected.severity]);
    rows.push(["Estado", selected.status]);
    rows.push(["Sector", selected.sector]);
    rows.push(["Ubicación", selected.location]);
    rows.push(["Creado", fmtTime(selected.createdAt)]);
    rows.push(["SLA (min)", String(selected.slaMin)]);
    rows.push(["Unidad asignada", selected.assignedUnitId ?? ""]);
    rows.push(["Descripción", selected.description ?? ""]);
    rows.push([]);
    rows.push(["EVIDENCIAS"]);
    rows.push(["Nombre", "Tipo", "Hash", "Fecha"]);
    for (const e of incEvidences.slice().sort((a, b) => b.createdAt - a.createdAt)) {
      rows.push([e.name, e.type, e.hash, fmtTime(e.createdAt)]);
    }
    rows.push([]);
    rows.push(["BITÁCORA"]);
    rows.push(["Fecha", "Actor", "Acción", "Detalle"]);
    for (const ev of tline) {
      rows.push([fmtTime(ev.ts), ev.actor, ev.action, ev.detail ?? ""]);
    }

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.folio}_incidente.csv`;
    a.click();
    URL.revokeObjectURL(url);

    onAuditEvent(selected.id, "Exportación CSV", "Se exportó CSV del incidente.");
  };

  const printSelectedPDF = () => {
    if (!selected) return;

    const esc = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const incEvidences = evidences.filter((e) => e.incidentId === selected.id).slice().sort((a, b) => b.createdAt - a.createdAt);
    const tline = (timeline[selected.id] ?? []).slice().sort((a, b) => a.ts - b.ts);

    const createdStr = fmtTime(selected.createdAt);

    const evidRows = incEvidences.length
      ? incEvidences.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.type)}</td><td>${esc(e.hash)}</td><td>${esc(fmtTime(e.createdAt))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="muted">Sin evidencias</td></tr>`;

    const tlRows = tline.length
      ? tline.map((ev) => `<tr><td>${esc(fmtTime(ev.ts))}</td><td>${esc(ev.actor)}</td><td>${esc(ev.action)}</td><td>${esc(ev.detail ?? "")}</td></tr>`).join("")
      : `<tr><td colspan="4" class="muted">Sin eventos</td></tr>`;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(selected.folio)} - AVAI-CAD</title>
<style>
  body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin:24px;}
  h1{font-size:18px;margin:0 0 8px;}
  h2{font-size:14px;margin:18px 0 8px;}
  .muted{color:#555;font-size:12px;}
  table{width:100%;border-collapse:collapse;margin-top:8px;}
  th,td{border:1px solid #ddd;padding:8px;font-size:12px;vertical-align:top;}
  th{background:#f5f5f5;text-align:left;}
  .grid{display:grid;grid-template-columns: 1fr 1fr; gap:12px;}
  .box{border:1px solid #ddd;border-radius:12px;padding:12px;}
</style>
</head>
<body>
  <div class="muted">Arbiol Visión AI • AVAI-CAD • Reporte de incidente</div>
  <h1>${esc(selected.folio)} — ${esc(selected.title)}</h1>

  <div class="grid">
    <div class="box">
      <div><b>Tipo:</b> ${esc(selected.type)}</div>
      <div><b>Severidad:</b> ${esc(selected.severity)}</div>
      <div><b>Estado:</b> ${esc(selected.status)}</div>
      <div><b>Sector:</b> ${esc(selected.sector)}</div>
      <div><b>Ubicación:</b> ${esc(selected.location)}</div>
    </div>
    <div class="box">
      <div><b>Creado:</b> ${esc(createdStr)}</div>
      <div><b>SLA:</b> ${esc(String(selected.slaMin))} min</div>
      <div><b>Unidad:</b> ${esc(selected.assignedUnitId ?? "")}</div>
      <div><b>Descripción:</b> ${esc(selected.description ?? "")}</div>
    </div>
  </div>

  <h2>Evidencias</h2>
  <table>
    <thead><tr><th>Nombre</th><th>Tipo</th><th>Hash</th><th>Fecha</th></tr></thead>
    <tbody>${evidRows}</tbody>
  </table>

  <h2>Bitácora</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Detalle</th></tr></thead>
    <tbody>${tlRows}</tbody>
  </table>

  <script>
    window.onload = () => { window.print(); };
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();

    onAuditEvent(selected.id, "Exportación PDF", "Se generó impresión/guardado a PDF.");
  };

// -------- Cierre: reglas + RBAC (MVP) --------
const canClose = useMemo(() => {
  if (!selected) return { ok: false, reason: "Sin incidente seleccionado.", allowOverride: false };
  if (selected.status === "CERRADO") return { ok: false, reason: "El incidente ya está cerrado.", allowOverride: false };

  const hasEvidence = incidentEvidences.length > 0;

  // Regla: CRÍTICO requiere evidencia
  if (selected.severity === "CRITICO" && !hasEvidence) {
    // Coordinador puede hacer override (con motivo)
    if (role === "COORDINADOR") return { ok: false, reason: "Incidente CRÍTICO sin evidencia. Requiere evidencia para cerrar (o override de Coordinación).", allowOverride: true };
    return { ok: false, reason: "Incidente CRÍTICO requiere evidencia para cerrar.", allowOverride: false };
  }

  // Regla: Operador no cierra CRÍTICOS (aunque haya evidencia)
  if (role === "OPERADOR" && selected.severity === "CRITICO") {
    return { ok: false, reason: "Operador no puede cerrar incidentes CRÍTICOS. Requiere Supervisor/Coordinación.", allowOverride: false };
  }

  return { ok: true, reason: "", allowOverride: false };
}, [selected, incidentEvidences.length, role]);

const [overrideOpen, setOverrideOpen] = useState(false);
const [overrideReason, setOverrideReason] = useState("");

const attemptClose = () => {
  if (!selected) return;

  if (canClose.ok) {
    onIncidentStatus(selected.id, "CERRADO", operatorName);
    return;
  }

  // Log de bloqueo
  onAuditEvent(selected.id, "Cierre bloqueado", canClose.reason);

  if (role === "COORDINADOR" && canClose.allowOverride) {
    setOverrideOpen(true);
  }
};

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
  <Tabs defaultValue="map" className="w-full">
    <TabsList className="grid w-full grid-cols-2">
      <TabsTrigger value="map">Mapa</TabsTrigger>
      <TabsTrigger value="dispatch">Despacho</TabsTrigger>
    </TabsList>

    <TabsContent value="map" className="space-y-3">
{/* MAPA (mock interactivo) */}
<MapMock
  selectedIncident={selected}
  units={units}
/>

   {/* Acciones rápidas */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Acciones rápidas</div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => selected && onIncidentStatus(selected.id, "CLASIFICADO", "Supervisor")}
          >
            Clasificar
          </Button>

          <Button
            variant="secondary"
            onClick={() => selected && onIncidentStatus(selected.id, "EN_CAMINO", "Despacho")}
          >
            En camino
          </Button>

          <Button
            variant="secondary"
            onClick={() => selected && onIncidentStatus(selected.id, "EN_SITIO", "Unidad")}
          >
            En sitio
          </Button>

          <Button
            onClick={attemptClose}
            disabled={!selected || (!canClose.ok && !(role === "COORDINADOR" && canClose.allowOverride))}
          >
            Cerrar
          </Button>
        </div>

        {!canClose.ok && selected && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="font-semibold">No es posible cerrar este incidente</div>
            <div className="text-xs mt-1">{canClose.reason}</div>
            {role === "COORDINADOR" && canClose.allowOverride && (
              <div className="text-xs mt-2">Puedes aplicar un <b>override</b> con motivo obligatorio.</div>
            )}
          </div>
        )}

        <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Override de cierre (Coordinación)</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Este incidente está en condición de <b>cierre restringido</b>. Si decides continuar, se registrará en auditoría.
              </div>
              <div>
                <Label className="text-xs">Motivo del override (obligatorio)</Label>
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Ej. Se recibe autorización por radio, evidencia se anexará posteriormente, emergencia controlada..."
                />
                <div className="text-[11px] text-muted-foreground mt-1">Mínimo 10 caracteres.</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => { setOverrideOpen(false); setOverrideReason(""); }}>
                Cancelar
              </Button>
              <Button
                disabled={overrideReason.trim().length < 10 || !selected}
                onClick={() => {
                  if (!selected) return;
                  onAuditEvent(selected.id, "Override de cierre", overrideReason.trim());
                  onIncidentStatus(selected.id, "CERRADO", operatorName + " (COORDINADOR)");
                  setOverrideOpen(false);
                  setOverrideReason("");
                }}
              >
                Confirmar override y cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>







    </TabsContent>

    <TabsContent value="dispatch">

      {/* PANEL DE DESPACHO */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Cola de despacho</div>

        {incidents
          .filter((i) => i.status !== "CERRADO")
          .map((i) => (
            <div
              key={i.id}
              className="rounded-xl border p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium">{i.folio}</div>
                <div className="text-xs text-muted-foreground">
                  {i.sector} • {i.severity}
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  const unit = units.find((u) => u.status === "DISPONIBLE");
                  if (unit) {
                    onAssign(i.id, unit.id);
                    onUnitStatus(unit.id, "ASIGNADA");
                  }
                }}
              >
                Asignar
              </Button>
            </div>
          ))}
      </div>

    </TabsContent>
  </Tabs>

  {/* Evidencia (demo) */}
  <div className="rounded-2xl border p-4">
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold">Evidencia (demo)</div>
      <AddEvidenceDialog
        onAdd={(name, type) => selected && onAddEvidence(selected.id, name, type)}
        disabled={!selected || selected.status === "CERRADO"}
      />
    </div>

    <div className="mt-3 space-y-2">
      {(evidences ?? [])
        .filter((e) => e.incidentId === selected?.id)
        .map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <div className="text-sm font-medium">{e.name}</div>
              <div className="text-xs text-muted-foreground">
                {e.type} • Hash {e.hash.slice(0, 12)}… • {fmtTime(e.createdAt)}
              </div>
            </div>
            <Badge variant="secondary">Custodia</Badge>
          </div>
        ))}

      {(evidences ?? []).filter((e) => e.incidentId === selected?.id).length === 0 && (
        <div className="text-sm text-muted-foreground">Sin evidencias anexadas.</div>
      )}
    </div>
  </div>

</CardContent>


      </Card>

      {/* Right: Detail + Units + Timeline */}
      <Card className="col-span-12 xl:col-span-3">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Detalle
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={exportSelectedCSV} disabled={!selected}>Exportar CSV</Button>
              <Button size="sm" variant="secondary" onClick={printSelectedPDF} disabled={!selected}>PDF</Button>
            </div>
          </div>
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

              <Separator />

              {/* Sugerencias IA (demo) — requiere confirmación del operador */}
              <IASuggestionsPanel
                incident={selected}
                units={units}
                timeline={timeline[selected.id] ?? []}
                evidences={(evidences ?? []).filter((e) => e.incidentId === selected.id)}
                onConfirm={(label, apply) => {
                  // Confirmación manual: aplicar acción y auditar
                  apply();
                  onAuditEvent(selected.id, "Sugerencia IA confirmada", label);
                }}
                onAssign={(unitId) => onAssign(selected.id, unitId)}
                onClassify={() => onIncidentStatus(selected.id, "CLASIFICADO", operatorName)}
              />

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
  const [isAuthed, setIsAuthed] = useState(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("avai_cad_state_v1") : null;
    if (!raw) return false;
    try { return Boolean(JSON.parse(raw).isAuthed) || false; } catch { return false; }
  });
  const [operatorName, setOperatorName] = useState(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("avai_cad_state_v1") : null;
    if (!raw) return "Operador demo";
    try { return JSON.parse(raw).operatorName ?? "Operador demo"; } catch { return "Operador demo"; }
  });
  const [role, setRole] = useState<Role>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("avai_cad_state_v1") : null;
    if (!raw) return "OPERADOR";
    try { return (JSON.parse(raw).role as Role) ?? "OPERADOR"; } catch { return "OPERADOR"; }
  });
  const logoSrc = "/arbiol-logo.png";

  const [route, setRoute] = useState<"ops" | "analytics" | "evidence" | "admin">("ops");

  const STORAGE_KEY = "avai_cad_state_v1";

  const [incidents, setIncidents] = useState<Incident[]>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return seedIncidents();
    try {
      const parsed = JSON.parse(raw);
      return parsed.incidents ?? seedIncidents();
    } catch {
      return seedIncidents();
    }
  });

  const [units, setUnits] = useState<Unit[]>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return seedUnits();
    try {
      const parsed = JSON.parse(raw);
      return parsed.units ?? seedUnits();
    } catch {
      return seedUnits();
    }
  });

  const [timeline, setTimeline] = useState<Record<string, TimelineEvent[]>>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return seedTimeline();
    try {
      const parsed = JSON.parse(raw);
      return parsed.timeline ?? seedTimeline();
    } catch {
      return seedTimeline();
    }
  });

  const [evidences, setEvidences] = useState<Evidence[]>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) {
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
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed.evidences ?? [];
    } catch {
      return [];
    }
  });

  const [selectedId, setSelectedId] = useState<string | undefined>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return "inc_1";
    try {
      const parsed = JSON.parse(raw);
      return parsed.selectedId ?? "inc_1";
    } catch {
      return "inc_1";
    }
  });


  // Persistencia demo (localStorage) + RBAC navegación
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      incidents,
      units,
      timeline,
      evidences,
      selectedId,
      operatorName,
      role,
      isAuthed,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [incidents, units, timeline, evidences, selectedId, operatorName, role]);

  useEffect(() => {
    if (!isAuthed) return;
    if (role === "ADMIN_TI" && route !== "admin") setRoute("admin");
  }, [isAuthed, role, route]);

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
    pushEvent(id, operatorName, "Incidente creado", `Tipo: ${inc.type} | Sev: ${inc.severity}`);
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
    // RBAC/Reglas de cierre
    if (status === "CERRADO") {
      const inc = incidents.find((x) => x.id === incidentId);
      if (inc) {
        const chk = canCloseIncident(inc, role, evidences);
        if (!chk.ok) {
          pushEvent(incidentId, actor, "Cierre bloqueado", chk.reason ?? "No permitido");
          return;
        }
      }
    }

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
      createdBy: operatorName,
    };
    setEvidences((prev) => [ev, ...prev]);
    pushEvent(incidentId, operatorName, "Evidencia anexada", `${type}: ${name} | Hash ${ev.hash.slice(0, 12)}…`);
  };

const onAuditEvent = (incidentId: string, action: string, detail?: string) => {
  pushEvent(incidentId, `${operatorName} (${role})`, action, detail);
};


  const title = route === "ops" ? "Operación" : route === "analytics" ? "Analítica" : route === "evidence" ? "Evidencias" : "Administración";

if (!isAuthed) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoginCard
        defaultName={operatorName}
        defaultRole={role}
        logoSrc={logoSrc}
        onLogin={(name, r) => {
          setOperatorName(name);
          setRole(r);
          setIsAuthed(true);
        }}
      />
    </div>
  );
}

if (!isAuthed) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoginCard
        defaultName={operatorName}
        defaultRole={role}
        onLogin={(name, r) => {
          setOperatorName(name);
          setRole(r);
          setIsAuthed(true);
        }}
      />
    </div>
  );
}

  return (
    <div className="min-h-screen flex">
      <Sidebar
        active={route}
        onNavigate={(k) => setRoute(k as any)}
        operatorName={operatorName}
        role={role}
        onLogout={() => {
          setIsAuthed(false);
          setRoute("ops");
        }}
      />
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
            operatorName={operatorName}
            role={role}
            onCreateIncident={onCreateIncident}
            onSelect={setSelectedId}
            selectedId={selectedId}
            onAssign={onAssign}
            onIncidentStatus={onIncidentStatus}
            onUnitStatus={onUnitStatus}
            onAddEvidence={onAddEvidence}
            onAuditEvent={onAuditEvent}
          />
        )}
        {route === "analytics" && <AnalyticsScreen incidents={incidents} />}
        {route === "evidence" && <EvidenceScreen evidences={evidences} incidents={incidents} />}
        {route === "admin" && (role === "COORDINADOR" || role === "ADMIN_TI" ? <AdminScreen /> : (
  <div className="p-6">
    <Card>
      <CardHeader>
        <CardTitle>Acceso restringido</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Esta sección requiere rol <b>COORDINADOR</b> o <b>ADMIN_TI</b>.
      </CardContent>
    </Card>
  </div>
))}
      </div>
    </div>
  );
}
