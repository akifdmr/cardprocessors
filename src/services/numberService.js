const { query } = require("../db");
const maskingService = require("./maskingService");

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function ensureCardExists(cardId) {
  const result = await query("select id from cards where id = $1", [cardId]);
  if (result.rowCount === 0) {
    throw new Error("Card not found");
  }
}

async function addNumber({ phoneNumber, cardId, isVerified = false, addedBy = "system" }) {
  await ensureCardExists(cardId);

  const verificationCode = isVerified ? null : generateVerificationCode();
  const maskedNumber = maskingService.createMaskedNumber(phoneNumber);

  const result = await query(
    `insert into card_phone_numbers (
      card_id,
      phone_number,
      masked_number,
      verification_code,
      is_verified,
      added_by
    ) values ($1, $2, $3, $4, $5, $6)
    returning
      id,
      card_id,
      phone_number,
      masked_number,
      is_verified,
      added_by,
      created_at,
      updated_at`,
    [cardId, phoneNumber, maskedNumber, verificationCode, Boolean(isVerified), addedBy]
  );

  const row = result.rows[0];
  return {
    ...sanitizeRow(row),
    verificationCode
  };
}

async function verifyNumber(numberId, code) {
  const result = await query(
    `select
      id,
      card_id,
      phone_number,
      masked_number,
      verification_code,
      is_verified,
      added_by,
      created_at,
      updated_at
    from card_phone_numbers
    where id = $1`,
    [numberId]
  );

  if (result.rowCount === 0) {
    throw new Error("Number not found");
  }

  const row = result.rows[0];
  if (row.is_verified) {
    return {
      success: true,
      message: "Number already verified",
      data: sanitizeRow(row)
    };
  }

  if (!code || row.verification_code !== code) {
    throw new Error("Invalid verification code");
  }

  await query(
    `update card_phone_numbers
    set
      is_verified = true,
      verification_code = null,
      updated_at = current_timestamp
    where id = $1`,
    [numberId]
  );

  const refreshed = await query(
    `select
      id,
      card_id,
      phone_number,
      masked_number,
      is_verified,
      added_by,
      created_at,
      updated_at
    from card_phone_numbers
    where id = $1`,
    [numberId]
  );

  return {
    success: true,
    message: "Number verified successfully",
    data: sanitizeRow(refreshed.rows[0])
  };
}

async function getNumbersByCard(cardId) {
  const result = await query(
    `select
      id,
      card_id,
      phone_number,
      masked_number,
      is_verified,
      added_by,
      created_at,
      updated_at
    from card_phone_numbers
    where card_id = $1
    order by created_at desc`,
    [cardId]
  );

  return result.rows.map(sanitizeRow);
}

async function listAllNumbers() {
  const result = await query(
    `select
      id,
      card_id,
      phone_number,
      masked_number,
      is_verified,
      added_by,
      created_at,
      updated_at
    from card_phone_numbers
    order by created_at desc`
  );

  return result.rows.map(sanitizeRow);
}

function sanitizeRow(row) {
  return {
    id: row.id,
    cardId: row.card_id,
    phoneNumber: row.phone_number,
    maskedNumber: row.masked_number,
    isVerified: Boolean(row.is_verified),
    addedBy: row.added_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  addNumber,
  verifyNumber,
  getNumbersByCard,
  listAllNumbers
};
