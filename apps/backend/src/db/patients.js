import { pool } from "./pool.js";

export async function getPatientBySessionUuid(patientUuid) {
  const result = await pool.query(
    `select uuid, session_start, session_expires_at
     from patients
     where uuid = $1`,
    [patientUuid]
  );

  return result.rows[0] || null;
}

export async function createPatientWithSession({
  firstName,
  lastName,
  birthday,
  sessionStart,
  sessionExpiresAt
}) {
  const result = await pool.query(
    `insert into patients (first_name, last_name, birthday, session_start, session_expires_at)
     values ($1, $2, $3, $4, $5)
     returning uuid, first_name, last_name, birthday, session_start, session_expires_at`,
    [firstName, lastName, birthday, sessionStart, sessionExpiresAt]
  );

  return result.rows[0];
}

export async function insertPatientData({ patientUuid, payload }) {
  const result = await pool.query(
    `insert into patient_data (patient_uuid, payload)
     values ($1, $2)
     returning id, patient_uuid, payload, updated_at`,
    [patientUuid, payload]
  );

  return result.rows[0];
}

export async function clearPatientRecords(patientUuid) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const deletedData = await client.query(
      "delete from patient_data where patient_uuid = $1",
      [patientUuid]
    );
    const deletedPatients = await client.query(
      "delete from patients where uuid = $1",
      [patientUuid]
    );

    await client.query("commit");

    return {
      patientUuid,
      deletedPatientDataRows: deletedData.rowCount ?? 0,
      deletedPatientRows: deletedPatients.rowCount ?? 0
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTopPriorityPatients(limit = 50) {
  const result = await pool.query(
    `select
       p.uuid,
       p.number_rank,
       p.category,
       p.first_name,
       p.last_name,
       p.birthday,
       p.description,
       p.session_start,
       p.session_expires_at,
       p.created_at,
       latest_data.payload as latest_payload,
       latest_data.updated_at as latest_payload_updated_at
     from patients p
     left join lateral (
       select pd.payload, pd.updated_at
       from patient_data pd
       where pd.patient_uuid = p.uuid
       order by pd.updated_at desc
       limit 1
     ) latest_data on true
     order by p.category asc, p.number_rank asc nulls last, p.created_at asc
     limit $1`,
    [limit]
  );

  return result.rows;
}

function collectStringsFromValue(value, collector) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      collector.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringsFromValue(item, collector);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStringsFromValue(item, collector);
    }
  }
}

export async function getPatientStringSummary(patientUuid) {
  const patientResult = await pool.query(
    `select uuid, first_name, last_name, description
     from patients
     where uuid = $1`,
    [patientUuid]
  );

  const patient = patientResult.rows[0] || null;
  if (!patient) {
    return null;
  }

  const dataResult = await pool.query(
    `select payload
     from patient_data
     where patient_uuid = $1
     order by updated_at desc`,
    [patientUuid]
  );

  const strings = [];
  if (patient.description) {
    strings.push(patient.description);
  }

  for (const row of dataResult.rows) {
    collectStringsFromValue(row.payload, strings);
  }

  return {
    patientUuid: patient.uuid,
    patientName: `${patient.first_name} ${patient.last_name}`.trim(),
    strings,
    summary: strings.length > 0 ? strings.join(" | ") : "only media"
  };
}
