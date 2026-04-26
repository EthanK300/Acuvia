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
  category,
  firstName,
  lastName,
  birthday,
  description,
  sessionStart,
  sessionExpiresAt
}) {
  const result = await pool.query(
    `insert into patients (category, first_name, last_name, birthday, description, session_start, session_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning uuid, category, first_name, last_name, birthday, description, session_start, session_expires_at`,
    [category, firstName, lastName, birthday, description ?? null, sessionStart, sessionExpiresAt]
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
