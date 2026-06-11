const { query } = require("../db");

async function writeAuditLog({ entityType, entityId = null, action, status, actorUserId = null, details = null }) {
  await query(
    `insert into audit_logs (
      entity_type,
      entity_id,
      action,
      status,
      actor_user_id,
      details
    ) values ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, action, status, actorUserId, details ? JSON.stringify(details) : null]
  );
}

async function listAuditLogs({ entityType = null, entityId = null, limit = 100 }) {
  const filters = [];
  const params = [];

  if (entityType) {
    filters.push(`entity_type = $${params.length + 1}`);
    params.push(entityType);
  }

  if (entityId) {
    filters.push(`entity_id = $${params.length + 1}`);
    params.push(entityId);
  }

  params.push(limit);
  const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";

  const result = await query(
    `select
      id,
      entity_type,
      entity_id,
      action,
      status,
      actor_user_id,
      details,
      created_at
    from audit_logs
    ${whereClause}
    order by created_at desc
    limit $${params.length}`,
    params
  );

  return result.rows.map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null
  }));
}

module.exports = {
  listAuditLogs,
  writeAuditLog
};
