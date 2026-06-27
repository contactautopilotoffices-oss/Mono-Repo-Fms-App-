import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

// Bucket name - visitor-photos (with hyphen, matching Supabase bucket)
const BUCKET_NAME = "visitor-photos";

// Max file size: 5MB (Supabase free tier limit)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * POST /api/visitors/photos?propertyId=...
 * Upload visitor photo to Supabase Storage
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const visitorId = formData.get("visitor_id") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!visitorId) {
      return NextResponse.json({ error: "visitor_id required" }, { status: 400 });
    }

    // Validate file type - only images allowed for photos
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only image files allowed." }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large. Max 5MB allowed.` }, { status: 400 });
    }

    // Generate path: {propertyId}/{visitorId}.{ext}
    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${propertyId}/${visitorId}.${fileExt}`;

    // Upload to Supabase Storage - pass File object directly
    const { data: uploadData, error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("[visitors/photos] Upload error:", uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = admin.storage.from(BUCKET_NAME).getPublicUrl(uploadData.path);

    // Update visitor_logs with photo URL
    await admin
      .from("visitor_logs")
      .update({ photo_url: urlData.publicUrl })
      .eq("visitor_id", visitorId)
      .eq("property_id", propertyId);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: uploadData.path,
    });
  } catch (error: any) {
    console.error("[visitors/photos] Photo upload error:", error);
    return NextResponse.json({ error: `Internal error: ${error.message}` }, { status: 500 });
  }
}
