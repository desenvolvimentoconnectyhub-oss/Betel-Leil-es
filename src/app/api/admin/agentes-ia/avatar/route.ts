import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getPublicUrl(key: string) {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl && publicUrl.trim()) return `${publicUrl.replace(/\/$/, "")}/${key}`;
  return null;
}

const MAX_SIZE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const agentKey = formData.get("agentKey") as string | null;

    if (!file || !agentKey) {
      return NextResponse.json(
        { success: false, message: "Arquivo e agentKey sao obrigatorios." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, message: "Apenas imagens sao aceitas." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: "Arquivo muito grande. Maximo 5MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    let avatarUrl: string | null = null;

    const r2 = getR2Client();
    const bucket = process.env.R2_PUBLIC_BUCKET_NAME;

    if (r2 && bucket) {
      const objectKey = `agents/avatars/${agentKey}.${ext}`;
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: file.type,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      avatarUrl = getPublicUrl(objectKey);
    }

    if (!avatarUrl) {
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { success: false, message: "Sem R2_PUBLIC_URL configurado. Maximo 2MB para armazenamento inline." },
          { status: 400 }
        );
      }
      avatarUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
    }

    const supabase = getSupabaseAdminClient();
    if (supabase) {
      await supabase
        .from("ai_agents")
        .update({ avatar_icon: avatarUrl, updated_at: new Date().toISOString() })
        .eq("agent_key", agentKey);
    }

    return NextResponse.json({
      success: true,
      agentKey,
      avatarUrl,
      message: "Avatar atualizado com sucesso.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao fazer upload.",
      },
      { status: 500 }
    );
  }
}
