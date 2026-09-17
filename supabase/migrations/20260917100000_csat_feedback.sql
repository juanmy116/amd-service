-- Encuesta CSAT: trazabilidad del envío + vista de lectura para /admin/avis.
--
-- Contexto: hasta hoy no se sabía si una encuesta se había enviado ni a quién. Cuando el envío
-- no era posible (sin email de contacto y sin cuenta de portal), la función se callaba.

alter table public.csat_responses
  add column if not exists sent_to text,
  add column if not exists sent_at timestamptz;

comment on column public.csat_responses.sent_to is
  'Dirección a la que se envió la encuesta: contact_email del formulario QR, o email de la cuenta del portal.';
comment on column public.csat_responses.sent_at is
  'Momento del envío. NULL = nunca se llegó a enviar.';

-- Vista de lectura de /admin/avis: una fila por opinión RESPONDIDA, con todo lo que la
-- pantalla necesita ya resuelto (quién, qué avería, qué equipo).
-- security_invoker = true → hereda la RLS de las tablas base; csat_responses es admin-only
-- (policy admin_read_csat), así que la vista solo devuelve filas al admin.
create or replace view public.v_csat_feedback
with (security_invoker = true) as
select
  c.id,
  c.incident_id,
  c.rating,
  c.comment,
  c.responded_at,
  c.sent_to,
  c.sent_at,
  i.numero_incident,
  i.title,
  i.contact_name,
  i.contact_email,
  coalesce(i.machine_id, cm.machine_id) as machine_id,
  cl.nom_client
from public.csat_responses c
join public.incidents i          on i.id  = c.incident_id
left join public.contract_machines cm on cm.id = i.contract_machine_id
left join public.contracts ct    on ct.id = cm.contract_id
left join public.clients cl      on cl.id = ct.client_id
where c.responded_at is not null;

comment on view public.v_csat_feedback is
  'Opiniones respondidas por los clientes, con la avería y el cliente resueltos. Alimenta /admin/avis.';
