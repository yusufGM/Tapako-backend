import express from "express";
import Item from "../models/Item.js";
import ChangeLog from "../models/ChangeLog.js";

const r = express.Router();

r.get("/items", async (req, res) => {
  try {
    const {
      q = "",
      search = "",
      createdBy = "",
      status,
      category,
      page = 1,
      limit = 20,
      sort = "createdAt:desc",
      includeDeleted = "0"
    } = req.query;

    const filter = {};

    const qTrim = String(q || "").trim();
    const nameTrim = String(search || "").trim();
    const createdByTrim = String(createdBy || "").trim();

    if (qTrim) {
      filter.$or = [
        { name: { $regex: qTrim, $options: "i" } },
        { createdBy: { $regex: qTrim, $options: "i" } }
      ];
    } else {
      if (nameTrim) filter.name = { $regex: nameTrim, $options: "i" };
      if (createdByTrim) filter.createdBy = { $regex: createdByTrim, $options: "i" };
    }

    if (status) filter.status = status;
    if (category) filter.category = category;

    const s = {};
    const [sortField, sortDir] = String(sort).split(":");
    s[sortField || "createdAt"] = (sortDir || "desc") === "asc" ? 1 : -1;

    if (includeDeleted === "1") filter._includeDeleted = true;

    const lim = Math.max(+limit, 1);
    const sk = (Math.max(+page, 1) - 1) * lim;

    const [items, total] = await Promise.all([
      Item.find(filter).sort(s).skip(sk).limit(lim).lean(),
      Item.countDocuments(filter)
    ]);

    res.json({ items, page: +page, limit: lim, total, pages: Math.ceil(total / lim) });
  } catch (e) {
    res.status(500).json({ error: "Gagal ambil items", detail: e.message });
  }
});

r.post("/items", async (req, res) => {
  try {
    const doc = await Item.create({ ...req.body, createdBy: req.actor, updatedBy: req.actor });
    await ChangeLog.create({ refCollection: "items", refId: doc._id, action: "create", user: req.actor, diff: req.body });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ error: "Gagal menambah", detail: e.message });
  }
});

r.patch("/items/:id", async (req, res) => {
  try {
    const { version, ...updates } = req.body;
    updates.updatedBy = req.actor;

    const q = { _id: req.params.id };
    if (typeof version === "number") q.version = version;

    const before = await Item.findById(req.params.id).lean();
    const doc = await Item.findOneAndUpdate(q, updates, { new: true });

    if (!doc) return res.status(409).json({ error: "Versi konflik atau item tidak ditemukan" });

    await ChangeLog.create({
      refCollection: "items",
      refId: doc._id,
      action: "update",
      user: req.actor,
      diff: { before, after: doc }
    });

    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: "Gagal update", detail: e.message });
  }
});

r.delete("/items/:id", async (req, res) => {
  try {
    const { force } = req.query;

    if (force === "1") {
      const del = await Item.findByIdAndDelete(req.params.id);
      if (!del) return res.status(404).json({ error: "Tidak ditemukan" });
      await ChangeLog.create({ refCollection: "items", refId: del._id, action: "delete", user: req.actor, diff: { hard: true } });
      return res.json({ ok: true, hardDeleted: true });
    }

    const doc = await Item.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Tidak ditemukan" });

    await doc.softDelete(req.actor);
    await ChangeLog.create({ refCollection: "items", refId: doc._id, action: "delete", user: req.actor, diff: { soft: true } });

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Gagal hapus", detail: e.message });
  }
});

r.post("/items/:id/restore", async (req, res) => {
  try {
    const restored = await Item.restoreById(req.params.id);
    if (!restored) return res.status(404).json({ error: "Tidak ditemukan" });
    await ChangeLog.create({ refCollection: "items", refId: restored._id, action: "restore", user: req.actor });
    res.json(restored);
  } catch (e) {
    res.status(400).json({ error: "Gagal restore", detail: e.message });
  }
});

r.post("/items/bulk", async (req, res) => {
  try {
    const { ids = [], action, payload = {} } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids kosong" });

    let result = {};

    if (action === "delete") {
      const docs = await Item.find({ _id: { $in: ids } });
      await Promise.all(docs.map(d => d.softDelete(req.actor)));
      result.deleted = docs.length;
    } else if (action === "restore") {
      const r = await Item.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: null, deletedBy: null } });
      result.restored = r.modifiedCount;
    } else if (action === "status") {
      const r = await Item.updateMany({ _id: { $in: ids } }, { $set: { status: payload.status, updatedBy: req.actor } });
      result.updated = r.modifiedCount;
    } else {
      return res.status(400).json({ error: "action tidak dikenal" });
    }

    await ChangeLog.create({
      refCollection: "items",
      refId: null,
      action: "update",
      user: req.actor,
      diff: { bulk: true, action, ids, payload }
    });

    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({ error: "Bulk gagal", detail: e.message });
  }
});

export default r;
