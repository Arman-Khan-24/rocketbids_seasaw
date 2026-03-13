# 🚀 RocketBids

> A real-time credits-based auction platform built for CodeBidz Hackathon.
> Bid smart. Win big. No real money — just pure competition.

🌐 **Live Demo:** [rocketbids-seasaw-917z.vercel.app](https://rocketbids-seasaw-917z.vercel.app)
📦 **Repository:** [github.com/Arman-Khan-24/rocketbids_seasaw](https://github.com/Arman-Khan-24/rocketbids_seasaw)

---

## 👥 Team Seasaw

| Name | Unstop Profile |
|---|---|
| Aarsh Chauhan | [unstop.com/u/aarshcha43942](https://unstop.com/u/aarshcha43942) |
| Arman Khan | [unstop.com/u/armankha1765](https://unstop.com/u/armankha1765) |
| Mayank Borkar | [unstop.com/u/mayanbor6905](https://unstop.com/u/mayanbor6905) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage |
| AI | Google Gemini 1.5 Flash |
| Charts | Recharts |
| Icons | Lucide React |
| Deployment | Vercel |

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js 18+
- Supabase account (free tier)
- Google AI Studio account (free tier)
- Vercel account (free tier)

### 1. Clone the Repository
```bash
git clone https://github.com/Arman-Khan-24/rocketbids_seasaw.git
cd rocketbids_seasaw
npm install
```

### 2. Set Up Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/migrations/001_schema.sql`
3. Enable Realtime for `bids` and `auctions` tables in the Supabase dashboard
4. Create a storage bucket called `auctions` and set it to public

### 3. Get Gemini API Key
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click Get API Key
3. Copy the key — no credit card required

### 4. Configure Environment Variables
Create a `.env.local` file in the root directory:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 6. Create Admin Account
1. Register a new account on the platform
2. Go to Supabase dashboard → Table Editor → profiles
3. Find your user and change role from `bidder` to `admin`
4. Log out and log back in — you will be redirected to the admin panel

---

## ✨ Features

### Core Features
- ✅ Separate role-based authentication for Admin and Bidder
- ✅ Admin can create, edit, and delete auction listings with image upload
- ✅ Admin can assign credits to registered bidders
- ✅ Admin can close auctions and declare winners
- ✅ Bidders can browse active and upcoming auctions
- ✅ Bidders can place bids using assigned credits
- ✅ Real-time bid updates via Supabase Realtime
- ✅ Credits reservation system — credits held on bid, returned on outbid, deducted on win
- ✅ Live countdown timers on all auction cards and auction room
- ✅ Personal bid history and credit transaction log
- ✅ Dark and light mode toggle

### Unique Features
- 🎯 **Anti-Snipe Timer** — Any bid placed in the last 60 seconds automatically extends the auction by 30 seconds, preventing last-second sniping
- 🔥 **Bidding War Mode** — When two bidders exchange bids 3 or more times within 60 seconds, the auction enters war mode with a live pulsing red banner visible to all viewers
- 🚨 **Sniper Radar** — Automatically flags bidders who repeatedly place last-second bids, visible to admin in the live monitor with red alert cards

### AI Features (Gemini 1.5 Flash)
- 🤖 **AI Bid Advisor** — Analyzes real auction data including active bidders, time remaining, bid velocity, and your credit balance to recommend INVEST, AVOID, or WAIT with one line reasoning
- 💡 **Smart Bid Suggestions** — Three clickable bid options (Safe, Optimal, Aggressive) with win probability and AI generated reasoning for each
- 🎭 **Taunt and Praise System** — Short punchy one-liners appear as center top announcements for key moments like winning, getting outbid, bidding wars, sniping, and more

### Stretch Features
- ✅ Blind Auction Mode — Bid amounts hidden from all bidders until auction closes
- ✅ Credit Mining — Daily login bonus (+10 cr), bid activity bonus (+2 cr), win bonus (+25 cr)
- ✅ Auction Satellite Dashboard — Admin live monitor with active auctions, bids per minute, war detection, and sniper radar
- ✅ Bid Activity Chart — Real-time bid activity graph on reports page
- ✅ Bidding Personality — Account page shows your bidding style based on real bid history
- ✅ Mobile Responsive — Full mobile support with bottom navigation bar

### Admin Panel
- Dashboard with live stats — active auctions, total bidders, bids today, credits in circulation
- Auction management — create, edit, close, declare winner
- Bidder management — view all bidders, assign credits, see sniper flags
- Live monitor — real-time bid feed, war mode panel, sniper radar
- Winners page — all closed auctions with winners and winning bids
- Reports — bid activity chart, top bidders, top auctions, credit summary

### Bidder Panel
- Browse active and upcoming auctions with live countdowns
- Auction room with live bid feed, AI suggestions, increment buttons
- My Bids — full bid history with accurate status badges
- My Account — profile stats, bid history, credit log, bidding personality

---

## ⚠️ Known Limitations

- Admin account must be set manually via Supabase dashboard on first setup — no admin registration flow
- Auction status transitions (upcoming → active → closed) are triggered on page load and every 30 seconds, not via a dedicated cron job
- Gemini AI features fall back gracefully if API quota is hit but reasoning labels will not show
- Image uploads are limited to Supabase Storage free tier (1GB)
- No email verification on registration
- No proxy or auto-increment bidding

---

## 📁 Project Structure

```
rocketbids/
├── app/
│   ├── (auth)/login and register
│   ├── admin/ dashboard, auctions, bidders, monitor, winners, reports
│   ├── bidder/ browse, auctions/[id], history, account
│   └── api/ bids, credits, winners
├── components/
│   ├── ui/ reusable primitives
│   ├── auction/ AuctionCard, BidForm, BidFeed, Timer
│   ├── admin/ StatsCard, SniperRadar
│   └── shared/ Sidebar, ThemeToggle, Toast
├── lib/
│   ├── supabase/ client, server, middleware
│   └── hooks/ useAuction, useCredits, useProfile
└── supabase/
    └── migrations/ SQL schema
```

---

## 🚀 Deployment

Deployed on Vercel with automatic deployments on every push to main branch.
All environment variables configured in Vercel dashboard.
Supabase Realtime enabled for live bid updates in production.
