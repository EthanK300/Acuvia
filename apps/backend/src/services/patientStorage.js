import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { buildPatientDataObjectKey, PATIENT_DATA_BUCKET } from "./storageKeys.js";

let supabaseClient = null;

function getSupabaseStorageClient() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for media uploads");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  }

  return supabaseClient;
}

export function extensionFromMimeType(mimeType = "") {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("json")) return "json";
  return "bin";
}

export async function uploadPatientMedia({
  patientUuid,
  contentBase64,
  mimeType,
  timestamp
}) {
  const supabase = getSupabaseStorageClient();
  const extension = extensionFromMimeType(mimeType);
  const objectKey = buildPatientDataObjectKey(patientUuid, timestamp, extension);
  const fileBuffer = Buffer.from(contentBase64, "base64");

  const { error } = await supabase.storage
    .from(PATIENT_DATA_BUCKET)
    .upload(objectKey, fileBuffer, {
      contentType: mimeType || "application/octet-stream",
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload media: ${error.message}`);
  }

  return {
    bucket: PATIENT_DATA_BUCKET,
    objectKey,
    mimeType: mimeType || "application/octet-stream"
  };
}

export async function clearPatientMedia(patientUuid) {
  const supabase = getSupabaseStorageClient();
  const bucket = supabase.storage.from(PATIENT_DATA_BUCKET);

  let offset = 0;
  const limit = 100;
  let removedCount = 0;

  while (true) {
    const { data: objects, error: listError } = await bucket.list(patientUuid, {
      limit,
      offset
    });

    if (listError) {
      throw new Error(`Failed to list patient media: ${listError.message}`);
    }

    if (!objects || objects.length === 0) {
      break;
    }

    const objectKeys = objects
      .filter((item) => item.name)
      .map((item) => `${patientUuid}/${item.name}`);

    if (objectKeys.length > 0) {
      const { error: removeError } = await bucket.remove(objectKeys);
      if (removeError) {
        throw new Error(`Failed to remove patient media: ${removeError.message}`);
      }
      removedCount += objectKeys.length;
    }

    if (objects.length < limit) {
      break;
    }
    offset += limit;
  }

  return {
    bucket: PATIENT_DATA_BUCKET,
    removedObjectCount: removedCount
  };
}
