export const communityMediaBatchOperation = 'media-parts';
export const communityMediaBatchPolicyOperation = 'media-parts-policy';
export const communityMediaBatchPath = `/api/account/communities/${communityMediaBatchOperation}`;
export const communityMediaBatchParts = 4;
// Allow four encoded 256 KiB parts and the signed request envelope.
export const communityMediaBatchBodyBytes = 1_440_000;
