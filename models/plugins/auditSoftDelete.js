export default function auditSoftDelete(schema) {
  schema.add({
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
    version: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "active", "archived"], default: "active" }
  });
  function notDeletedFilter(next) {
    if (!this.getFilter()._includeDeleted) {
      this.where({ deletedAt: null });
    } else {
      const f = this.getFilter();
      delete f._includeDeleted;
    }
    next();
  }
  schema.pre("find", notDeletedFilter);
  schema.pre("findOne", notDeletedFilter);
  schema.pre("countDocuments", notDeletedFilter);
  schema.pre("findOneAndUpdate", function(next) {
    const update = this.getUpdate() || {};
    if (update.$set) update.$set.updatedAt = new Date();
    else update.$set = { updatedAt: new Date() };
    if (typeof update.version === "number") {
      update.version += 1;
    } else if (update.$inc) {
      update.$inc.version = 1;
    } else {
      update.$inc = { version: 1 };
    }
    next();
  });
  schema.methods.softDelete = function (username) {
    this.deletedAt = new Date();
    this.deletedBy = username || null;
    return this.save();
  };
  schema.statics.restoreById = function (id) {
    return this.findByIdAndUpdate(id, { $set: { deletedAt: null, deletedBy: null } }, { new: true });
  };
}
