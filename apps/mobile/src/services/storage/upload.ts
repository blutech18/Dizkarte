import { File } from "expo-file-system";
import { Platform } from "react-native";
import { getSupabaseClient } from "../../lib/supabase";
import {
  buildObjectPath,
  validateUpload,
  type StorageBucket,
  type UploadKind,
} from "./object-paths";

/**
 * Uploads a locally-picked file into a private Supabase Storage bucket.
 *
 * Every bucket is private (`supabase/migrations/0010`), so nothing here produces
 * a public URL. Reads go through short-lived signed URLs requested separately,
 * and the assigned-Admin path additionally requires
 * `admin_authorize_object_read`.
 *
 * The object path always starts with the uploader's own user id because each
 * bucket's `with check` clause compares the first path segment to `auth.uid()`.
 * A path built any other way is refused by the database.
 */

export type PickedFile = {
  /** Local file URI from the picker. */
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  /**
   * Size the picker reported. Pass `0` when it reported nothing: the real size
   * is read off disk before validation, because pickers are inconsistent about
   * this field and a missing value would otherwise read as "empty file".
   */
  readonly sizeBytes: number;
  readonly kind: UploadKind;
};

export type UploadedObject = {
  readonly bucket: StorageBucket;
  /** Object key inside the bucket, e.g. `<userId>/<taskId>/photo.jpg`. */
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly kind: UploadKind;
};

export type UploadOutcome =
  | { readonly ok: true; readonly object: UploadedObject }
  | { readonly ok: false; readonly message: string };

/**
 * Read a local file's bytes and true size. Supabase needs a body, not a handle.
 *
 * The read path is platform-aware because `expo-file-system`'s `File` API is
 * native-only and throws "expo-file-system is not supported on web". On web the
 * picker hands back a `blob:`/`data:` URL, which the `fetch` API can read
 * directly; on native we use the SDK 54+ `File` object (the legacy
 * `readAsStringAsync` helpers still typecheck but throw at runtime in this SDK,
 * and going through base64 also allocated the payload three times over).
 */
async function readLocalBytes(
  uri: string,
  fallbackSizeBytes: number,
): Promise<{ readonly bytes: Uint8Array; readonly sizeBytes: number }> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, sizeBytes: blob.size > 0 ? blob.size : fallbackSizeBytes };
  }
  const handle = new File(uri);
  // Trust the filesystem over the picker's optional metadata.
  const sizeBytes = handle.size > 0 ? handle.size : fallbackSizeBytes;
  const bytes = await handle.bytes();
  return { bytes, sizeBytes };
}

/**
 * Upload one file and return its stored metadata.
 *
 * Never throws for an expected condition — a rejected file type, an oversized
 * file, or a storage refusal all come back as `{ ok: false }` with a message the
 * UI can show, so a failed attachment does not lose the rest of the form.
 */
export async function uploadFile(input: {
  readonly bucket: StorageBucket;
  readonly userId: string;
  /** Record the file belongs to: a task, verification case, conversation, booking. */
  readonly scopeId: string;
  readonly file: PickedFile;
}): Promise<UploadOutcome> {
  let bytes: Uint8Array;
  let sizeBytes: number;
  try {
    const read = await readLocalBytes(input.file.uri, input.file.sizeBytes);
    bytes = read.bytes;
    sizeBytes = read.sizeBytes;
  } catch {
    return { ok: false, message: "Could not read that file. Try choosing it again." };
  }

  const validation = validateUpload({
    kind: input.file.kind,
    mimeType: input.file.mimeType,
    sizeBytes,
  });
  if (!validation.ok) return { ok: false, message: validation.message };

  const path = buildObjectPath({
    userId: input.userId,
    scopeId: input.scopeId,
    fileName: input.file.fileName,
    unique: String(Date.now()),
  });

  const { error } = await getSupabaseClient().storage.from(input.bucket).upload(path, bytes, {
    contentType: input.file.mimeType,
    // Paths carry a timestamp, so a collision means something is wrong;
    // failing is safer than silently replacing another object.
    upsert: false,
  });

  if (error) {
    return {
      ok: false,
      message: "Upload failed. Check your connection and try again.",
    };
  }

  return {
    ok: true,
    object: {
      bucket: input.bucket,
      path,
      fileName: input.file.fileName,
      mimeType: input.file.mimeType,
      sizeBytes,
      kind: input.file.kind,
    },
  };
}

/**
 * Short-lived signed URL for viewing a private object.
 *
 * Buckets are private, so this is the only way to render stored media. The
 * expiry is deliberately short: a leaked URL should stop working quickly.
 */
export async function createSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Remove an object the user just uploaded, e.g. after they undo an attachment. */
export async function removeObject(bucket: StorageBucket, path: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().storage.from(bucket).remove([path]);
    return !error;
  } catch {
    return false;
  }
}
