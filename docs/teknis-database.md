# Database & Data Model — YIELD VIBING

> **Skill Referensi:** database-schema-designer
> **Versi:** 1.0 | **Tanggal:** 26 Mei 2026
> **Tujuan:** Dokumentasi data model, storage strategy, dan kebijakan retensi data

---

## 1. Ringkasan Data Model

YIELD VIBING **tidak menggunakan database tradisional** (SQL/NoSQL). State disimpan di tiga lokasi:

| Layer | Storage | Data yang Disimpan |
|-------|---------|-------------------|
| On-chain (Sepolia) | Ethereum smart contract storage | Permission state, tx history (events) |
| Browser | `localStorage` / `sessionStorage` | Session state, UI state |
| Off-chain (ephemeral) | API request/response | Venice AI rekomendasi, 1Shot relay status |

Tidak ada server backend, tidak ada database yang dikelola developer.

---

## 2. On-Chain Storage (Smart Contract)

### `VaultDepositor.sol` — State Variables

```solidity
struct Permission {
    address allowedVault;    // vault yang diizinkan
    uint256 maxAmount;       // batas jumlah USDC (dalam wei)
    uint256 usedAmount;      // jumlah yang sudah dieksekusi
    uint256 expiresAt;       // timestamp expiry (Unix)
    bool isActive;           // status permission
}

mapping(address => Permission) public permissions; // user → permission
```

### Event Log (On-Chain Audit Trail)

| Event | Fields |
|-------|--------|
| `PermissionGranted` | user, vault, maxAmount, expiresAt |
| `SwapExecuted` | user, amountIn, amountOut |
| `DepositExecuted` | user, vault, amount, shares |
| `PermissionRevoked` | user, vault |

---

## 3. Browser Storage

### `localStorage` (persisten lintas sesi)

| Key | Value (contoh) | Deskripsi |
|-----|----------------|-----------|
| `yv_connected_address` | `"0x1234...5678"` | Wallet address terakhir |
| `yv_network` | `"sepolia"` | Network terakhir |
| `yv_vault_address` | `"0xABCD...EF01"` | Vault address terpilih |

### `sessionStorage` (hilang saat tab ditutup)

| Key | Value | Deskripsi |
|-----|-------|-----------|
| `yv_permission_context` | JSON string | ERC-7715 context |
| `yv_last_recommendation` | JSON string | Rekomendasi Venice AI terakhir |
| `yv_execution_state` | JSON string | Status eksekusi |

---

## 4. Entitas Utama

### Permission Object (off-chain representation)

```json
{
  "userAddress": "0x1234...5678",
  "allowedVault": "0xABCD...EF01",
  "maxAmount": "100000000",
  "usedAmount": "0",
  "expiresAt": 1749686400,
  "isActive": true,
  "permissionContext": "<ERC-7715 context string>"
}
```

### Venice AI Recommendation (ephemeral)

```json
{
  "vaultName": "MockVault USDC",
  "vaultAddress": "0xABCD...EF01",
  "estimatedAPY": "8.2%",
  "reasoning": "Vault ini menggunakan strategi lending konservatif...",
  "riskLevel": "Low"
}
```

### Execution State (session)

```json
{
  "steps": [
    { "name": "swap", "status": "confirmed", "txHash": "0xTX1..." },
    { "name": "approve", "status": "confirmed", "txHash": "0xTX2..." },
    { "name": "deposit", "status": "pending", "txHash": null }
  ],
  "totalAmount": "100000000",
  "vault": "0xABCD...EF01"
}
```

---

## 5. Relasi Utama

```
User Wallet Address
    │
    ├── 1 Permission (on-chain mapping di VaultDepositor.sol)
    │       ├── allowedVault
    │       ├── maxAmount
    │       └── expiresAt
    │
    └── N Events (on-chain logs, immutable)
            ├── PermissionGranted
            ├── SwapExecuted
            ├── DepositExecuted
            └── PermissionRevoked
```

---

## 6. Query Penting

| Query | Method | Kapan Digunakan |
|-------|--------|----------------|
| Cek permission aktif | `contract.permissions(userAddress)` | Sebelum eksekusi |
| Riwayat deposit | `queryFilter(DepositExecuted, userAddr)` | Status dashboard |
| Vault balance | `mockVault.balanceOf(userAddress)` | Setelah deposit |

---

## 7. Retensi Data & Privasi

| Data | Retensi | Catatan |
|------|---------|---------|
| On-chain events | Permanen (blockchain immutable) | Tidak bisa dihapus |
| Smart contract state | Sampai kontrak destroy | Testnet only |
| `localStorage` | Manual clear via browser | User kontrol penuh |
| `sessionStorage` | Hilang saat tab ditutup | Otomatis |
| Venice AI conversation | **Tidak disimpan** | No retention policy Venice AI |
| 1Shot relay logs | Kebijakan 1Shot | Di luar kontrol developer |

**Privacy note:** Data input user (jumlah USDC, risk level) tidak dikirim ke server developer. Venice AI tidak menyimpan data conversation.
