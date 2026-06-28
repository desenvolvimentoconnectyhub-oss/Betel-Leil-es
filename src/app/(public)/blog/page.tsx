import { getIntelligenceCenterData } from "@/lib/admin/repository";
import { BlogListPage } from "@/components/public/BlogListPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Blog | Betel Leiloes",
  description: "Artigos, noticias e analises sobre leiloes imobiliarios no Brasil.",
};

export default async function BlogRoute() {
  const data = await getIntelligenceCenterData();
  return <BlogListPage posts={data.data.posts} />;
}
