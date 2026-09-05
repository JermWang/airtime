/** Direct multipart uploads are deliberately bounded; longer shows should use a verified media link. */
export const MAX_DIRECT_UPLOAD_BYTES = 64 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 512 * 1024;
