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
     returning uuid, session_start, session_expires_at`,
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
