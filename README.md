# Aritra's Vault: Distributed Object Storage & Consensus Engine

A fault-tolerant distributed object storage system inspired by Amazon S3 and MinIO with multi-node replication, SHA-256 integrity verification, automated self-healing, bitrot scrubber, and quorum consensus.

The system supports two distinct architectural operational modes:
1. **LOCAL DEMO MODE**: 4 independent local storage node HTTP daemons (`:5001`, `:5002`, `:5003`, `:5004`), filesystem storage under `storage/node1` through `storage/node4`, and embedded SQLite metadata. Demonstrates genuine physical hardware failure and network partition.
2. **CLOUD / VERCEL MODE**: Managed persistent Supabase PostgreSQL database metadata and Supabase Storage (`vault-objects` bucket) organized across 4 logical replica domains (`node-1/{id}`, `node-2/{id}`, etc.).

---

## Architecture Modes

| Feature | LOCAL DEMO (`DATABASE_MODE=sqlite`, `STORAGE_MODE=local`) | CLOUD / VERCEL (`DATABASE_MODE=supabase`, `STORAGE_MODE=supabase`) |
| :--- | :--- | :--- |
| **Node Execution** | 4 genuine independent HTTP storage servers on ports 5001-5004 | 4 logical replica placement domains on Supabase Storage |
| **Storage Backend** | Real local filesystem directories (`storage/node1..4`) | Supabase Storage bucket (`vault-objects`) |
| **Metadata DB** | Embedded SQLite (`storage/vault_metadata.sqlite.json`) | Cloud PostgreSQL on Supabase (`objects`, `replicas`, etc.) |
| **Bitrot Scrubbing** | Mutates bytes in local filesystem files & verifies SHA-256 | Mutates bytes in Supabase Storage replica path & verifies SHA-256 |
| **Quorum Self-Healing**| Reconstructs replica between node directories | Reconstructs replica between Supabase Storage domain paths |
| **Primary Use Case** | Hackathon live demonstration of node failures & partitions | Persistent cloud deployment on Vercel / serverless |

> **Important Architectural Disclosure**: In Cloud mode, the 4 node IDs (`node-1` through `node-4`) represent logical replica domains rather than physically isolated hardware servers. For genuine independent hardware/process failure demonstration, use Local Demo mode.

---

## Quickstart: Local Development Mode

Start the Coordinator API, the 4 independent storage node daemons, and the React frontend simultaneously:

```bash
npm run vault:dev
```

This starts:
- **Coordinator & UI**: `http://localhost:3000`
- **Storage Node 1**: `http://localhost:5001` (`storage/node1/`)
- **Storage Node 2**: `http://localhost:5002` (`storage/node2/`)
- **Storage Node 3**: `http://localhost:5003` (`storage/node3/`)
- **Storage Node 4**: `http://localhost:5004` (`storage/node4/`)

---

## Cloud / Supabase / Vercel Deployment

### 1. Database Setup in Supabase
Run the migration located in `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor:
- Creates `objects`, `replicas`, `activities`, `repair_tasks`, and `cluster_config` tables.
- Sets up primary keys, foreign keys, constraints, and indexes.

### 2. Storage Setup in Supabase
In your Supabase Dashboard:
1. Navigate to **Storage** ➔ **New bucket**.
2. Name the bucket `vault-objects` (Private).

### 3. Environment Variables
Configure the following in your Vercel project settings or `.env`:

```env
DATABASE_MODE=supabase
STORAGE_MODE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-secret-key
SUPABASE_ANON_KEY=your-supabase-anon-key
```

*Note: `SUPABASE_SERVICE_ROLE_KEY` is server-only and is NEVER exposed to the frontend browser bundle.*

---

## Verification & Commands

```bash
# Check TypeScript types
npm run lint

# Build production bundle
npm run build

# Start local full-stack cluster
npm run vault:dev
```
