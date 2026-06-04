-- Tabla de leads del formulario público de contacto.
CREATE TABLE leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  company    text NOT NULL,
  phone      text NOT NULL,
  needs      text NOT NULL CHECK (needs IN ('rental','sales','management','maintenance','other')),
  message    text,
  status     text NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','traité','archivé')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_status_created_idx ON leads (status, created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Solo admin gestiona. El insert público lo hace el route con service_role (bypassa RLS).
CREATE POLICY "admin_all_leads" ON leads FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
