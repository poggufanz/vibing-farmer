# Keamanan & Privasi — YIELD VIBING

> **Skill Referensi:** security-review + data-privacy-compliance
> **Versi:** 1.0 | **Tanggal:** 26 Mei 2026
> **Tujuan:** Dokumentasi threat model, kontrol keamanan, privasi data, dan compliance

---

## 1. Ringkasan Keamanan & Privasi

YIELD VIBING dirancang dengan prinsip **permission-bounded execution** — agent tidak pernah memiliki akses penuh ke wallet user. Semua eksekusi dibatasi oleh ERC-7715 scoped permission yang user tentukan sendiri.

**Prinsip keamanan utama:**
- Tidak ada admin key atau privileged role di smart contract
- Permission scope di-enforce on-chain (revert, bukan silent fail)
- Venice AI tidak menyimpan data user (no data retention)
- Tidak ada server backend yang menyimpan credential atau private key

---

## 2. Data Classification

| Data | Klasifikasi | Lokasi | Sensitif? |
|------|-------------|--------|-----------|
| Wallet address | Public (on-chain) | Blockchain | Tidak |
| Permission context (ERC-7715) | Semi-private | Browser session + 1Shot relay | Ya |
| USDC amount + risk preference | Input user | Venice AI API (ephemeral) | Rendah |
| Private key / seed phrase | Secret | Tidak pernah diakses aplikasi | Sangat sensitif |
| Venice AI conversation | N/A | Tidak disimpan Venice AI | N/A |

---

## 3. Threat Model Ringkas

### Threat 1: Agent Exceed Permission

**Deskripsi:** Agent mencoba swap atau deposit melebihi batas yang user set.

**Mitigasi:**
- Smart contract revert jika `amount > maxAmount`
- Smart contract revert jika `vault != allowedVault`
- Smart contract revert jika `block.timestamp >= expiresAt`
- Tidak ada silent fail — semua violation = revert + event `ExecutionFailed`

---

### Threat 2: Permission Context Leak

**Deskripsi:** ERC-7715 permission context yang dicuri bisa digunakan pihak ketiga.

**Mitigasi:**
- Permission context hanya di `sessionStorage` (hilang saat tab ditutup)
- Tidak dikirim ke server developer
- User bisa revoke permission kapanpun

---

### Threat 3: Smart Contract Reentrancy

**Deskripsi:** Vault deposit callback bisa memicu re-entry ke `VaultDepositor`.

**Mitigasi:**
- CEI pattern (Checks → Effects → Interactions) di semua fungsi state-changing
- `ReentrancyGuard` dari OpenZeppelin sebagai defense-in-depth

---

### Threat 4: Frontend Injection / XSS

**Deskripsi:** Script injection bisa mencuri permission context dari sessionStorage.

**Mitigasi:**
- Tidak ada user-generated content yang di-render sebagai HTML
- Venice AI response di-sanitize sebelum ditampilkan

---

## 4. Kontrol Keamanan

### Smart Contract

| Kontrol | Implementasi |
|---------|-------------|
| Permission scope validation | `require(vault == allowedVault)` + `require(amount <= maxAmount)` |
| Expiry check | `require(block.timestamp < expiresAt)` |
| Reentrancy guard | `ReentrancyGuard` OpenZeppelin |
| No admin key | Tidak ada `onlyOwner` di fungsi kritis |
| CEI pattern | Checks → Effects → Interactions di semua fungsi |
| Event logging | Semua aksi penting emit event |

### Frontend

| Kontrol | Implementasi |
|---------|-------------|
| Input sanitization | Sanitize Venice AI response sebelum render |
| No private key handling | Aplikasi tidak pernah minta private key |
| Network check | Verifikasi user di Sepolia sebelum eksekusi |
| Permission review | Tampilkan detail scope sebelum user approve |

### API Security

| Kontrol | Implementasi |
|---------|-------------|
| Venice AI API key | Environment variable, tidak di-hardcode |
| HTTPS only | Semua API call via HTTPS |
| Input validation | Validasi amount (positif, ≤ balance) sebelum kirim ke contract |

---

## 5. Compliance

| Aspek | Status |
|-------|--------|
| Data personal (PII) | Tidak ada PII yang dikumpulkan atau disimpan |
| GDPR / privasi | Venice AI no-retention align dengan data minimization |
| KYC/AML | N/A — testnet, bukan mainnet financial product |
| Smart contract audit | Belum diaudit — hackathon scope, bukan untuk mainnet |

**Peringatan:** Proyek ini adalah demo hackathon di Sepolia testnet. Tidak untuk digunakan dengan aset nyata di mainnet tanpa audit smart contract yang komprehensif.

---

## 6. Checklist Keamanan Pre-Demo

- [ ] Tidak ada private key atau API key yang ter-hardcode di kode
- [ ] Venice AI API key disimpan di `.env` yang di-gitignore
- [ ] Semua fungsi state-changing di kontrak pakai CEI pattern
- [ ] `require` statements terpasang: vault, amount, expiry
- [ ] Venice AI response di-sanitize sebelum render ke DOM
- [ ] `forge test` semua pass, coverage ≥ 80%
- [ ] Demo wallet hanya berisi USDC testnet (tidak ada aset mainnet)
- [ ] Permission revocation berjalan dengan benar
