# Attendance Demo

One-tap clock-in / clock-out attendance tracker with a real-time manager dashboard. Built as a proof-of-concept replacement for paper timesheets in small Japanese SMEs.

## Why it exists

Many Japanese small businesses still run attendance on paper or a desktop time clock. Both fail the same way: managers see today's attendance tomorrow, payroll runs on lossy data, and remote/branch staff fall outside the system entirely. This demo shows how a single-tap mobile UX plus a live dashboard can solve all three at once.

## What it does

- **One-tap clock-in / clock-out** — no login screen, identifies the device per employee
- **Live manager dashboard** — current presence, daily / weekly aggregates, late and overtime detection
- **Mobile-first** — works on any phone via the browser; no app install
- **Designed to be seeded** — the demo ships with a small Japanese SME employee roster so a prospect can see it running in their own context immediately

## Stack

- Next.js 16 App Router + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Prisma + PostgreSQL

## Run locally

```bash
npm install
cp .env.example .env.local       # set DATABASE_URL
npx prisma migrate dev
npm run dev
```

---

Built by [Keigo Yoshinaga](https://github.com/yoshinagak-sudo) — CEO of Butai Farm. Used as a sales demo for Japanese SMEs evaluating paperless attendance.
