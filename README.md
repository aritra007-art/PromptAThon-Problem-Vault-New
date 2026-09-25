# Aritra's Vault — Fault-Tolerant Distributed Object Storage Prototype

> **NOTE:** This project is a **hackathon prototype**, built to demonstrate real distributed object-storage concepts — including multi-node replication, automatic failover, consensus repair, on-disk bitrot corruption detection, and cluster load rebalancing.

---

## 1. Architecture Overview

```
                        +----------------------------+
                        |      React Web UI          |
                        | (Port 3000 / Vite SPA)     |
                        +--------------+-------------+
                                       | HTTP / REST
                                       v
                        +----------------------------+
                        |     Coordinator API        |
                        | (Port 3000 / SQLite DB)    |
                        +--------------+-------------+
                                       |
           +---------------------------+---------------------------+
           |                           |                           |
           v                           v                           v
+--------------------+      +--------------------+      +--------------------+      +--------------------+
|   Storage Node 1   |      |   Storage Node 2   |      |   Storage Node 3   |      |   Storage Node 4   |
|   Port 5001        |      |   Port 5002        |      |   Port 5003        |      |   Port 5004        |
| storage/node1/     |      | storage/node2/     |      | storage/node3/     |      | storage/node4/     |
+--------------------+      +--------------------+      +--------------------+      +--------------------+
```

### Key Components

1. **Coordinator Service (`server/coordinator.ts`)**:
   - Manages centralized metadata stored in **SQLite** (`storage/metadata.db`).
   - Discovers storage nodes, polls node health & latency every 3 seconds.
   - Executes placement strategy to balance replica distribution.
   - Coordinates multi-way uploads and failover downloads.
   - Monitors cluster quorum and triggers autonomous repair jobs.

2. **4 Independent Storage Node Daemons (`server/storageNode.ts`)**:
   - **Node 1** (`http://127.0.0.1:5001`, directory `storage/node1/`)
   - **Node 2** (`http://127.0.0.1:5002`, directory `storage/node2/`)
   - **Node 3** (`http://127.0.0.1:5003`, directory `storage/node3/`)
   - **Node 4** (`http://127.0.0.1:5004`, directory `storage/node4/`)
   - Each node independently stores binary object payloads on its local disk.

3. **Metadata Persistence Layer (`server/db.ts`)**:
   - SQLite relational database with journaled tables: `objects`, `replicas`, `activities`, `repair_tasks`, and `cluster_config`.

4. **React Dashboard Frontend (`src/`)**:
   - Infrastructure UI with live metrics, node topology, repair queues, object explorer, and audit logs.

---

## 2. Storage Directory Structure

```
storage/
├── metadata.db             <-- SQLite database with authoritative metadata
├── node1/                  <-- Independent filesystem for Node 1
│   ├── obj_171000_abc      <-- Actual stored binary payload
│   └── obj_171000_abc.meta.json
├── node2/                  <-- Independent filesystem for Node 2
├── node3/                  <-- Independent filesystem for Node 3
└── node4/                  <-- Independent filesystem for Node 4
```

---

## 3. Storage Node HTTP API

Each storage node exposes independent REST endpoints:

- `GET /health` — Node status, capacity, used bytes, stored objects, heartbeat timestamp, simulated latency.
- `GET /objects` — Lists all objects hosted on this node's filesystem.
- `GET /objects/:objectId` — Returns raw binary file bytes with headers (`X-Object-Checksum`, `X-Object-Version`, `X-Node-Id`).
- `PUT /objects/:objectId` — Accepts raw binary body, writes to local disk, computes and returns SHA-256 checksum.
- `DELETE /objects/:objectId` — Permanently removes file and metadata from this node.
- `GET /objects/:objectId/checksum` — Computes SHA-256 on the physical file on disk.
- `POST /objects/:objectId/corrupt` — Modifies bytes on disk to simulate bitrot.
- `POST /objects/:objectId/stale` — Downgrades replica version to simulate inconsistency.
- `POST /simulate/fail` — Marks node as `OFFLINE` (halts daemon traffic).
- `POST /simulate/partition` — Simulates network partition (isolate).
- `POST /simulate/recover` — Restores node to `HEALTHY`.

---

## 4. Coordinator HTTP API

Mounted at `/api`:

- `GET /api/cluster/status` — Cluster stats, node health, healthy replica quorum count.
- `GET /api/objects` — All objects with replica statuses.
- `GET /api/objects/:objectId` — Single object details.
- `POST /api/objects/upload` — Multipart/raw ingestion; distributes bytes to healthy nodes.
- `GET /api/objects/:objectId/download` — Failover download stream from healthy replica.
- `DELETE /api/objects/:objectId` — Purges object from metadata and all host nodes.
- `POST /api/nodes/:nodeId/fail` — Halts target node.
- `POST /api/nodes/:nodeId/partition` — Simulates network partition.
- `POST /api/nodes/:nodeId/recover` — Reconnects and reconciles node.
- `POST /api/objects/:objectId/nodes/:nodeId/corrupt` — Injects on-disk bitrot.
- `POST /api/verify` — Computes SHA-256 across all replicas and compares against canonical hash.
- `POST /api/repair/:objectId` — Rebuilds missing or corrupted replicas.
- `POST /api/repair/all` — Repairs all degraded objects.
- `POST /api/rebalance` — Rebalances cluster storage load.
- `GET /api/activities` — Immutable chronological audit log.
- `GET /api/repairs` — Active and completed repair tasks.
- `POST /api/reset` — Resets cluster to baseline state.

---

## 5. Development & Running Instructions

### Run Everything Together (Recommended)
```bash
npm run dev
# or
npm run vault:dev
```
This single command:
1. Initializes the SQLite metadata database (`storage/metadata.db`).
2. Starts the 4 storage node daemons on ports 5001, 5002, 5003, and 5004.
3. Launches the Coordinator API on port 3000.
4. Mounts the Vite React frontend on `http://localhost:3000`.

### Run Components Individually (Optional Multi-Terminal Setup)

**Start Storage Node 1:**
```bash
npm run node:1
```

**Start Storage Node 2:**
```bash
npm run node:2
```

**Start Storage Node 3:**
```bash
npm run node:3
```

**Start Storage Node 4:**
```bash
npm run node:4
```

**Start Standalone Coordinator API:**
```bash
npm run coordinator
```

---

## 6. How Distributed Features Work

### A. Replica Placement Algorithm
When a file is ingested, the Coordinator queries all nodes with status `HEALTHY` and sorts them by disk utilization ratio ascending. Replicas are placed on the least utilized nodes to prevent hotspotting.

### B. Failover Object Retrieval
When a user downloads a file:
1. The Coordinator inspects replica metadata.
2. It attempts to stream the bytes from the primary replica node.
3. If that node is offline, partitioned, or corrupted, it automatically fails over to the next healthy replica node.
4. Returns the file with response headers indicating the actual serving node (`X-Retrieved-From-Node: Storage Node 4 (Failover)`).

### C. Automatic Self-Healing & Repair
When a node fails or is partitioned, objects residing on it drop below the desired replication factor (e.g., `2/3`).
1. Coordinator locates a surviving healthy replica.
2. Streams clean file bytes from the healthy source node.
3. Finds an available healthy node without an existing replica.
4. Uploads the bytes and verifies the target node's SHA-256.
5. Updates SQLite metadata and restores the quorum to `3/3`.

### D. On-Disk Corruption (Bitrot) Simulation & Scrubbing
- Clicking **Simulate Bitrot** directly modifies the actual file bytes inside `storage/nodeX/<objectId>`.
- Clicking **Verify All** invokes `GET /objects/:objectId/checksum` on each node, hashing the actual bytes on disk.
- Mismatches are flagged as `CORRUPTED`.
- The autonomous repair worker automatically streams the clean block from a healthy replica and overwrites the corrupted replica file on disk.

### E. Network Partition Simulation
- Simulates network isolation (`PARTITIONED`) where the node's local files remain intact on disk, but the node is unreachable by the Coordinator.
- When the partition is healed, the Coordinator reconciles its replicas and brings it back to `HEALTHY`.

### F. Cluster Storage Rebalancing
- Migrates objects from the node with the highest disk utilization to the node with the lowest disk utilization.
- Safely verifies the new replica before releasing the old replica.

---

## 7. Official Hackathon Demonstration Scenario

To demonstrate the full lifecycle to judges:
1. Click **13-Step Demo Scenario** in the header.
2. **Step 1:** Ingest `demo-file.pdf` with replication factor 3.
3. **Step 2:** Verify 3 distinct storage nodes host real copies on disk.
4. **Step 3:** Click **Simulate Node Failure** on one host node.
5. **Step 4:** Observe object replica count change to `2/3` with status `REPAIR REQUIRED`.
6. **Step 5:** Watch the background repair worker copy real bytes to an available healthy node, restoring quorum to `3/3`.
7. **Step 6:** Click **Simulate Bitrot** on a replica.
8. **Step 7:** Run **Verify All** — observe on-disk SHA-256 mismatch detected.
9. **Step 8:** Automatic self-healing restores the replica with clean bytes from healthy quorum.
10. **Step 9:** Click **Recover Node** to restore the failed node to active quorum.
