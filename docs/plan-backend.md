# Plan Backend — AMD Service Web

## Principios
- Pocas piezas → menos cosas que pueden romperse
- Servicios con tier gratuito generoso y bien documentados
- El equipo de AMD puede ver los leads sin tocar código

---

## Las tres piezas

### 1. Resend — emails transaccionales
- Alternativa moderna a Mailjet, diseñada para Next.js
- API extremadamente simple, 3.000 emails/mes gratis
- Envía el email de notificación al equipo y la confirmación al prospecto

### 2. Supabase — base de datos de leads (proyecto nuevo)
- PostgreSQL gestionado, tier gratuito amplio
- El equipo de AMD puede ver y filtrar leads directamente desde el dashboard web, sin código
- Integración nativa con Next.js

### 3. Next.js Server Actions — lógica del formulario
- Sin endpoint /api/ separado, la lógica vive dentro del propio componente
- Más simple de mantener, menos archivos

---

## Flujo cuando alguien envía el formulario

```
Usuario rellena el formulario
        ↓
Server Action valida los datos
        ↓
   ┌────┴────┐
Supabase   Resend
(guarda    (email al equipo AMD)
el lead)   (email de confirmación al prospecto)
```

---

## Lo que NO incluimos y por qué
- n8n / automatizaciones → añadir complejidad ahora no aporta valor real
- Dashboard de admin → Supabase ya tiene uno incorporado
- CRM externo → innecesario en esta fase

---

## Pendiente antes de implementar
- [ ] Confirmar dominio para email de envío (ej. noreply@amd-service.com) — Resend lo necesita para no caer en spam
- [ ] Revisar campos actuales del formulario de contacto
- [ ] Crear proyecto nuevo en Supabase
- [ ] Crear cuenta en Resend y verificar dominio
