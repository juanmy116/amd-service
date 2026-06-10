# Auditoría del sistema de incidencias — 2026-06-10

> Valoración desde el punto de vista de responsable de IT/infraestructura. Basada en auditoría real: políticas RLS de la BD, índices, código que modifica incidencias y advisors de Supabase. Punto de partida para el trabajo del 2026-06-11.

---

## 1. ¿Aguanta 50 tickets/día?

**Sí, con muchísimo margen — técnicamente es un no-problema.** 50/día ≈ 1.500/mes ≈ 18.000/año. Postgres resuelve consultas sobre decenas de miles de filas en milisegundos, incluso sin índices. La pila (Supabase Postgres + Next en Vercel) está sobrada; se podría multiplicar por 50 ese volumen antes de que la infraestructura fuera tema.

**El límite real a 50/día es operativo, no técnico:**
- Asignación **manual** (admin o kiosko Atelier reparte los tickets) → cuello de botella de persona.
- **No hay aviso al técnico** al asignarle un ticket (lo ve al abrir la PWA).
- **No hay SLA/escalado** automático por prioridad.

Higiene: **falta índice en `incidents.assigned_to`**, la columna por la que filtran todas las consultas del técnico y la RLS. Irrelevante a este volumen, pero debería existir.

## 2. ¿Compartimentación real entre técnicos?

**Sí, y bien hecho: la barrera está en la BASE DE DATOS (RLS), no en la interfaz.** Verificado:

| Acción | Regla en la BD | Resultado |
|---|---|---|
| Ver incidencias | `assigned_to = auth.uid()` | No puede leer las de otro |
| Modificar | `assigned_to = auth.uid()` (USING + check) | No puede editar ajenas ni reasignarse las suyas |
| Borrar | sin política para técnico | No puede borrar |
| Piezas / historial | limitado a sus incidencias asignadas | Aislado |

Doble protección: Server Action + página comprueban propiedad **y** la BD la fuerza. Aunque alguien llamara a la API con su token saltándose la UI, la BD lo bloquea. Estándar de oro.

**Grietas menores (ninguna es fuga de datos entre técnicos):**
1. `incident_history` INSERT solo comprueba `changed_by = auth.uid()`, no la propiedad de la incidencia → un técnico podría añadir una línea de historial a una incidencia ajena (integridad, severidad baja).
2. `incident_photos`: sin política para técnico → verificar cómo suben/ven fotos los técnicos (¿vía permisos elevados?).
3. El auto-paso a `en_cours` del escaneo usa cliente admin que **se salta la RLS** y se apoya en un filtro en código. Correcto hoy, pero su seguridad depende del código → debería tener test.
4. `maintenance_visits` (mantenimientos, no incidencias): **sí está mal** — cualquier técnico ve las visitas de cualquiera. Ya en backlog.

## 3. Valoración general

Sólido y consciente de la seguridad, por encima de lo típico en un SAV de este tamaño: aislamiento forzado en BD, rastro de auditoría (`incident_history`), separación por rol, tickets numerados (SAV-YYYY-NNNN), prioridades, Kanban, kiosko dispatcher.

**Advisors de Supabase (2026-06-10): 0 críticos/errores.** Muchos WARN, casi todos ruido por diseño o micro-optimizaciones. Los que valen:
- **Protección de contraseñas filtradas DESACTIVADA** → activar (un clic en el panel Auth).
- **`auth_rls_initplan`** (22 políticas): la RLS llama `auth.uid()` por fila; envolver en `(SELECT auth.uid())`. Irrelevante a 50/día, pero es la recomendación oficial.
- **FKs sin índice** (incluido `assigned_to`).
- `multiple_permissive_policies` (28), `unused_index` (8): limpieza menor.

## 4. Mejoras priorizadas (si yo fuera el responsable)

1. **Tests del aislamiento RLS** (lo nº 1). El aislamiento es la propiedad crítica de seguridad y hoy no tiene tests; una futura migración podría romperlo en silencio. Es la **Fase 2** del plan de tests (`docs/pendientes.md`).
2. **Cerrar grietas menores:** ownership en insert de historial; `maintenance_visits` por técnico; verificar camino de fotos.
3. **Ganancias rápidas de seguridad:** activar protección de contraseñas filtradas; revisar funciones `SECURITY DEFINER` ejecutables por `anon`.
4. **Higiene de rendimiento (barato, a futuro):** índice en `incidents.assigned_to`; envolver `auth.uid()` en políticas; quitar índices sin uso.
5. **Operativa (el límite real al crecer):** aviso al técnico al asignar; vista de carga + reparto automático/round-robin; SLA/escalado por prioridad.
6. **Fiabilidad:** confirmar backups/PITR de Supabase (datos de clientes); monitorización/alertas de errores; `get_advisors` periódico.

---

## Resumen ejecutivo
El sistema **está listo para 50/día de sobra** y el **aislamiento entre técnicos es real y bien construido** (forzado en BD). Sin agujeros críticos. Falta **red de tests sobre ese aislamiento** y un puñado de mejoras menores de seguridad/rendimiento/operativa. Para una v1 en producción, es un sistema sano.

## Para empezar mañana (orden sugerido)
1. Fase 1 de tests (rápida): `extractSerie` + mapeo nombre + fijar `select`. Ver `docs/pendientes.md`.
2. Ganancias rápidas: activar protección de contraseñas filtradas (panel) + índice `assigned_to`.
3. Planificar Fase 2 (tests RLS) — la de máximo valor.
