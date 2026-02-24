/**
 * S3 bucket for file storage.
 */

export const bucket = new sst.aws.Bucket("HolocronBucket", {
  access: "private",
});
