# Skenario Demo — Vibing Farmer

> **Skill Referensi:** mobile-developer + blockchain-developer + cognitive-fluency-psychology
> **Versi:** 2.0 | **Tanggal:** 27 Mei 2026
> **Tujuan:** Panduan alur demo end-to-end untuk video submission hackathon

---

## 1. Tujuan Demo

Menunjukkan bahwa Vibing Farmer berhasil mengotomatisasi multi-vault deposit flow menggunakan agent swarm — dari input intent hingga semua vault terkonfirmasi di Sepolia — dengan Venice AI sebagai koordinator, skill system yang bisa di-review user, dan visualisasi real-time di vis.js graph.

**Narasi inti demo:**
> "Kamu punya 100 USDC. Biasanya butuh 8 popup MetaMask per vault dan 15 menit per vault. Dengan Vibing Farmer: Venice AI generate strategy + skill agents otomatis, kamu review dan approve sekali, agent swarm eksekusi dua vault paralel — tanpa bayar gas. Set once. Vibe forever."

---

## 2. Persona Demo

| Persona | Nama | Profil |
|---------|------|--------|
| Yield Farmer Aktif | Arya | Punya 100 USDC, ingin multi-vault farming efisien, tidak mau repeat 8 popup per vault |
| Observer (penonton video) | Juri / Developer | Mengevaluasi integrasi MetaMask + 1Shot + Venice AI + agent coordination |

---

## 3. Alur Demo Langkah Demi Langkah

### Step 0: Persiapan (Sebelum Record)

- MetaMask Flask (bukan regular MetaMask) terinstall, akun Sepolia tersedia
- AgentVaultDepositor + 2x MockVault sudah deploy di Sepolia
- 100 USDC testnet sudah tersedia di wallet demo
- Venice AI API key sudah dikonfigurasi
- `agents/memory/` sudah berisi minimal 1 memory entry dari sesi sebelumnya (opsional tapi kuat untuk demo)

---

### Step 1: Input Intent ke Venice AI (0:00–0:45)

1. Buka Vibing Farmer di browser
2. Tampilkan form input:
   - "Berapa USDC kamu?" → 100 USDC
   - "Risk level?" → Low
   - "Berapa vault?" → 2
3. Klik "Generate Strategy"
4. Venice AI memberikan respons:
   - **Strategy:** 50 USDC ke MockVault USDC-A (APY: 7.8%), 50 USDC ke MockVault USDC-B (APY: 8.2%)
   - **Agent 1 skills:** `{ swap: { maxSlippage: 0.5, dexPreference: "uniswap-v3" }, deposit: { maxAmount: 50000000, vault: "0xVaultA" } }`
   - **Agent 2 skills:** `{ swap: { maxSlippage: 0.5, dexPreference: "uniswap-v3" }, deposit: { maxAmount: 50000000, vault: "0xVaultB" } }`
   - **Privacy note:** "Strategy ini diproses di Venice AI — data kamu tidak disimpan."

**Visual yang ditampilkan:** Strategy card + 2 skill cards (Agent 1 dan Agent 2)

---

### Step 2: Review & Approve Skill Sets (0:45–1:15)

1. UI menampilkan dua Skill Card (editable):
   - **Agent 1:** maxSlippage: 0.5% | vault: MockVault USDC-A | maxAmount: 50 USDC
   - **Agent 2:** maxSlippage: 0.5% | vault: MockVault USDC-B | maxAmount: 50 USDC
2. Demo: ubah Agent 2 maxSlippage ke 0.3% (menunjukkan editability)
3. Klik "Approve Skill Sets"
4. UI update: "Skills approved — agents ready" ✓

**Visual yang ditampilkan:** Editable skill form + approve button

---

### Step 3: Connect Wallet + EIP-7702 Upgrade (1:15–2:00)

1. Klik tombol "Connect Wallet"
2. MetaMask Flask popup → pilih akun
3. Aplikasi mendeteksi akun sebagai EOA
4. Tampilkan info: "Akun kamu akan di-upgrade ke Smart Account via EIP-7702"
5. MetaMask Flask menampilkan authorization request
6. User sign → akun sekarang bertindak sebagai smart account
7. UI update: badge "Smart Account Active" ✓

**Visual:** MetaMask Flask authorization dialog + status badge EOA → Smart Account

---

### Step 4: Grant ERC-7715 Permissions (2:00–2:30)

1. UI menampilkan 2 permission request cards (satu per agent):
   - **Agent 1:** "Izinkan swap max **50 USDC** dan deposit ke vault **MockVault USDC-A (0xVaultA)**. Expiry: 24 jam."
   - **Agent 2:** "Izinkan swap max **50 USDC** dan deposit ke vault **MockVault USDC-B (0xVaultB)**. Expiry: 24 jam."
2. User klik "Grant Permissions for All Agents"
3. MetaMask Flask menampilkan `wallet_requestExecutionPermissions` (2x atau batch)
4. User approve → UI update: "2 agent permissions active" ✓

**Visual:** Permission cards per agent + MetaMask dialog

---

### Step 5: Agent Swarm Eksekusi Paralel (2:30–3:30)

1. vis.js Network graph muncul:
   - Node pusat: **Orchestrator Agent** (biru, running)
   - Edges ke: **Worker Agent 1** (abu) + **Worker Agent 2** (abu)
   - Edges dari Workers ke: **MockVault A** + **MockVault B**

2. Klik "Launch Agent Swarm" → Orchestrator dispatch Workers secara paralel

3. **Worker Agent 1** (kiri):
   - AgentStarted event → node: abu → biru (running)
   - SwapExecuted → "Swap 50 USDC ✓"
   - ApproveExecuted → "Approve VaultA ✓"
   - DepositExecuted → node: biru → hijau (confirmed) ✓

4. **Worker Agent 2** (kanan, berjalan bersamaan):
   - Sama seperti Agent 1 tapi ke VaultB
   - Kedua agents berjalan **simultan di graph**

5. AgentCompleted events → semua node hijau
6. Tidak ada popup MetaMask selama eksekusi (semua via 1Shot relay)

**Visual:** vis.js graph dengan 2 Workers berjalan paralel, node berubah warna real-time

---

### Step 6: Memory di Node Detail (3:30–3:50)

1. Klik node **Worker Agent 1** di graph
2. Detail panel muncul:
   - Skill yang digunakan: `{ swap: { maxSlippage: 0.5 }, deposit: { maxAmount: 50000000 } }`
   - Memory entries:
     ```
     step: swap | status: success | executionTime: 4.2s | slippage: 0.12%
     step: deposit | status: success | shares: 50023456 | executionTime: 3.8s
     lesson: "MockVault A reliable with 0.5% slippage"
     ```
3. Tunjukkan bahwa memory ini akan dibaca oleh Venice AI di eksekusi berikutnya

**Visual:** Node detail panel dengan skill JSON + memory entries

---

### Step 7: Verifikasi di Sepolia Etherscan (3:50–4:20)

1. Klik Etherscan link di salah satu Agent node
2. Tunjukkan transaction di Sepolia:
   - `from` = 1Shot relayer address (BUKAN user wallet) → gas abstraction terbukti
   - Events: `AgentStarted`, `SwapExecuted`, `ApproveExecuted`, `DepositExecuted`, `AgentCompleted`
   - MockVault balance bertambah

---

### Step 8: Closing (4:20–4:45)

- Ringkas:
  - "100 USDC → 2 vault dalam < 60 detik"
  - "Venice AI generate strategy + skill, user review sekali"
  - "2 agents paralel, 0 gas, 0 manual tx"
  - "Set once. Vibe forever."
- Tampilkan 4 prize track yang tercapai

---

## 4. Checklist Kesiapan Demo

**Smart Contracts**
- [ ] AgentVaultDepositor + 2x MockVault deploy di Sepolia
- [ ] Contract addresses ter-hardcode di frontend atau `.env`
- [ ] forge test semua pass

**Frontend**
- [ ] Venice AI strategy + skill generation berjalan dengan API key valid
- [ ] Skill review UI editable + approve berfungsi
- [ ] vis.js graph init + 2 Workers tervisualisasi
- [ ] Graph node update real-time dari on-chain events
- [ ] Memory panel terbuka saat klik node
- [ ] 1Shot relay dikonfigurasi + relay test Sepolia berhasil
- [ ] EIP-7702 upgrade visible di MetaMask Flask
- [ ] ERC-7715 permission dialog tampil (per agent atau batch)

**Demo Environment**
- [ ] MetaMask Flask (bukan regular MM) terinstall di browser demo
- [ ] 100 USDC testnet tersedia di wallet demo
- [ ] Venice AI API key valid + respons teruji
- [ ] Koneksi internet stabil selama recording
- [ ] Screen recorder siap (resolusi ≥ 1080p)
- [ ] Script narasi sudah disiapkan

---

## 5. Expected Outcomes

| Outcome | Target |
|---------|--------|
| Full flow selesai tanpa error | ✓ (mandatory) |
| Venice AI strategy + skill gen visible | ✓ (Venice track) |
| Skill review + edit step visible | ✓ (Agent track) |
| 2 Workers berjalan paralel di graph | ✓ (A2A track) |
| EIP-7702 upgrade visible di MetaMask Flask | ✓ (qualification) |
| ERC-7715 permission dialog per agent tampil | ✓ (qualification) |
| 1Shot relay tx visible di Etherscan | ✓ (1Shot track) |
| Agent memory visible di node detail | ✓ (Agent track) |
| Durasi demo | ≤ 5 menit |
| User interactions (klik) selama demo | ≤ 8 klik |

---

## 6. Demo Flow (Final — Phase 4)

### Scene 1: Load App (30s)
- Open http://localhost:3000
- Show dark 3-column layout
- Console: "YIELD VIBING ready. Connect wallet to start."

### Scene 2: Connect Wallet (30s)
- Click Connect Wallet → MetaMask Flask popup
- After connect: step dot "01 Connect" green, right rail shows address + "eip-7702 ready"

### Scene 3: Venice AI Strategy (60s)
- Fill: Amount 10 USDC, Risk Medium, Vaults 2, Venice API Key
- Click Generate Strategy
- Show: graph appears — Orchestrator (yellow) + 2 Workers (grey) + 2 Vaults (purple)
- Activity log: Venice AI rationale (not fallback)

### Scene 4: Node Detail (30s)
- Click Orchestrator node → right rail shows agent counts
- Click Worker 1 → Agent ID, Vault address, Skills (Venice-generated JSON)

### Scene 5: ERC-7715 Permission (60s)
- Click Approve & Execute
- MetaMask Flask popup: erc20-token-periodic, USDC, 24h expiry
- Approve → "Permission granted. Dispatching agents..."

### Scene 6: Agent Execution (60s)
- Workers turn blue (active)
- Workers turn green (completed)
- Activity log: "Done — 2 deposited, 0 failed"
- Step 04 Execute green

### Scene 7: Memory Entries (30s)
- Click Worker node AFTER execute
- Memory entries: step names, ✓ status, timestamps, lesson text

### Scene 8: Reset (15s)
- Click Reset → clean slate, localStorage cleared
