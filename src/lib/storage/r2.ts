import "server-only";

import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isLikelyPropertyImageUrl } from "@/lib/scraper/quality";

type AppConfig = Map<string, string>;

export type StoredImageAsset = {
  url: string;
  sourceUrl: string;
  storageKey?: string;
  status: "mirrored" | "external" | "failed";
  contentType?: string;
  sizeBytes?: number;
  alt?: string;
  error?: string;
  collectedAt: string;
};

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  publicUrl: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 40;

function cleanConfigValue(value: unknown) {
  return String(value || "").trim();
}

async function readAppConfig(): Promise<AppConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase.from("app_config").select("key,value");
  if (error || !data) return new Map();

  return new Map(
    data
      .map((row) => [cleanConfigValue(row.key).toLowerCase(), cleanConfigValue(row.value)] as const)
      .filter(([key, value]) => Boolean(key && value))
  );
}

function resolveConfig(appConfig: AppConfig, name: string) {
  return appConfig.get(name.toLowerCase()) || cleanConfigValue(process.env[name]);
}

async function getR2Config(): Promise<R2Config | null> {
  const appConfig = await readAppConfig();
  const endpoint = resolveConfig(appConfig, "R2_ENDPOINT");
  const accessKeyId = resolveConfig(appConfig, "R2_ACCESS_KEY_ID");
  const secretAccessKey = resolveConfig(appConfig, "R2_SECRET_ACCESS_KEY");
  const publicBucket = resolveConfig(appConfig, "R2_PUBLIC_BUCKET_NAME");
  const publicUrl = resolveConfig(appConfig, "R2_PUBLIC_URL");

  if (!endpoint || !accessKeyId || !secretAccessKey || !publicBucket || !publicUrl) return null;

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBucket,
    publicUrl: publicUrl.replace(/\/$/, ""),
  };
}

function safeSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90) || "imovel";
}

function extensionFor(contentType: string, sourceUrl: string) {
  const fromType = contentType.split(";")[0].trim().toLowerCase();
  if (fromType === "image/png") return "png";
  if (fromType === "image/webp") return "webp";
  if (fromType === "image/gif") return "gif";
  if (fromType === "image/avif") return "avif";
  if (fromType === "image/svg+xml") return "svg";

  try {
    const pathname = new URL(sourceUrl).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return ext;
  } catch {}

  return "jpg";
}

function isHttpImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function uniqueUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url) => {
      if (!isHttpImageUrl(url) || !isLikelyPropertyImageUrl(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

export async function mirrorRemoteImagesToR2(input: {
  opportunityCode: string;
  imageUrls: string[];
  alt?: string;
  maxImages?: number;
}): Promise<StoredImageAsset[]> {
  const collectedAt = new Date().toISOString();
  const imageUrls = uniqueUrls(input.imageUrls).slice(0, input.maxImages || MAX_IMAGES);
  if (!imageUrls.length) return [];

  const config = await getR2Config();
  if (!config) {
    return imageUrls.map((sourceUrl) => ({
      url: sourceUrl,
      sourceUrl,
      status: "external",
      alt: input.alt,
      error: "R2 publico nao configurado.",
      collectedAt,
    }));
  }

  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const code = safeSegment(input.opportunityCode);

  return Promise.all(imageUrls.map(async (sourceUrl, index): Promise<StoredImageAsset> => {
    try {
      const response = await fetch(sourceUrl, {
        headers: { "User-Agent": "BetelBot/1.0 (+https://betel.com.br)" },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.toLowerCase().startsWith("image/")) throw new Error(`Conteudo nao e imagem: ${contentType}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Imagem maior que 8MB.");

      const hash = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 12);
      const extension = extensionFor(contentType, sourceUrl);
      const storageKey = `opportunities/${code}/photos/${String(index + 1).padStart(2, "0")}-${hash}.${extension}`;

      await client.send(
        new PutObjectCommand({
          Bucket: config.publicBucket,
          Key: storageKey,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );

      return {
        url: `${config.publicUrl}/${storageKey}`,
        sourceUrl,
        storageKey,
        status: "mirrored",
        contentType,
        sizeBytes: buffer.length,
        alt: input.alt,
        collectedAt,
      };
    } catch (error) {
      return {
        url: sourceUrl,
        sourceUrl,
        status: "failed",
        alt: input.alt,
        error: error instanceof Error ? error.message : "Falha ao espelhar imagem.",
        collectedAt,
      };
    }
  }));
}
