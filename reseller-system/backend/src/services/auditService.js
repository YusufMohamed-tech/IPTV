const ActivityLog = require("../models/ActivityLog");

async function writeAudit({ actor, actorRole, action, targetType, targetId, metadata }) {
  await ActivityLog.create({
    actor: actor || null,
    actorRole: actorRole || "unknown",
    action,
    targetType: targetType || "",
    targetId: targetId ? String(targetId) : "",
    metadata: metadata || {},
  });
}

module.exports = { writeAudit };
