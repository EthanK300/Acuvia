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

export async function getPatientDetails(patientUuid) {
  const result = await pool.query(
    `select uuid, first_name, last_name, birthday, category, description, session_start, session_expires_at
     from patients
     where uuid = $1`,
    [patientUuid]
  );

  return result.rows[0] || null;
}

export async function getPatientForRanking(patientUuid) {
  const result = await pool.query(
    `select
       p.uuid,
       p.category,
       p.description,
       p.created_at,
       latest_data.payload as latest_payload
     from patients p
     left join lateral (
       select pd.payload
       from patient_data pd
       where pd.patient_uuid = p.uuid
       order by pd.updated_at desc
       limit 1
     ) latest_data on true
     where p.uuid = $1`,
    [patientUuid]
  );

  return result.rows[0] || null;
}

export async function createPatientWithSession({
  category,
  numberRank,
  firstName,
  lastName,
  birthday,
  description,
  sessionStart,
  sessionExpiresAt
}) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update patients
       set number_rank = number_rank + 1
       where category = $1
         and number_rank >= $2`,
      [category, numberRank]
    );

    const result = await client.query(
      `insert into patients (
         category,
         number_rank,
         first_name,
         last_name,
         birthday,
         description,
         session_start,
         session_expires_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning uuid, category, number_rank, first_name, last_name, birthday, description, session_start, session_expires_at`,
      [category, numberRank, firstName, lastName, birthday, description ?? null, sessionStart, sessionExpiresAt]
    );

    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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

export async function listPatientDataHistory(patientUuid) {
  const result = await pool.query(
    `select payload, updated_at
     from patient_data
     where patient_uuid = $1
     order by updated_at asc`,
    [patientUuid]
  );

  return result.rows;
}

export async function updatePatientTriage({ patientUuid, category, description }) {
  const result = await pool.query(
    `update patients
     set category = $1,
         description = $2
     where uuid = $3
     returning uuid, category, description`,
    [category, description, patientUuid]
  );

  return result.rows[0] || null;
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

export async function listCategoryPatientsForRanking(category) {
  const result = await pool.query(
    `select
       p.uuid,
       p.category,
       p.number_rank,
       p.description,
       p.created_at,
       latest_data.payload as latest_payload
     from patients p
     left join lateral (
       select pd.payload
       from patient_data pd
       where pd.patient_uuid = p.uuid
       order by pd.updated_at desc
       limit 1
     ) latest_data on true
     where p.category = $1`,
    [category]
  );

  return result.rows;
}

export async function updateCategoryRanks(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const assignment of assignments) {
      await client.query(
        `update patients
         set number_rank = $1
         where uuid = $2`,
        [assignment.numberRank, assignment.patientUuid]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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
