import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const BUCKET_NAME = "auctions";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function extensionFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "bin";
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Storage server keys are not configured" },
      { status: 500 },
    );
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: adminProfile, error: adminProfileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfileError) {
    console.warn(
      "Unable to read profile role for upload route. Falling back to user metadata.",
      adminProfileError,
    );
  }

  const resolvedRole =
    adminProfile?.role === "admin" || adminProfile?.role === "bidder"
      ? adminProfile.role
      : user.user_metadata?.role === "admin"
        ? "admin"
        : "bidder";

  if (resolvedRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, and GIF images are allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 5MB" },
      { status: 400 },
    );
  }

  const { data: existingBucket, error: bucketError } = await serviceClient.storage.getBucket(
    BUCKET_NAME,
  );

  if (
    bucketError &&
    !bucketError.message.toLowerCase().includes("not found")
  ) {
    return NextResponse.json(
      { error: `Failed to access storage bucket: ${bucketError.message}` },
      { status: 500 },
    );
  }

  if (!existingBucket) {
    const { error: createBucketError } = await serviceClient.storage.createBucket(BUCKET_NAME, {
      public: true,
      allowedMimeTypes: ALLOWED_TYPES,
      fileSizeLimit: MAX_IMAGE_SIZE_BYTES,
    });

    if (createBucketError && !createBucketError.message.toLowerCase().includes("already")) {
      return NextResponse.json(
        { error: `Unable to initialize storage bucket: ${createBucketError.message}` },
        { status: 500 },
      );
    }
  }

  const fileExt = extensionFromFile(file);
  const filePath = `${new Date().getFullYear()}/${crypto.randomUUID()}.${fileExt}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Image upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = serviceClient.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  return NextResponse.json({ publicUrl, filePath });
}