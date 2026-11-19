import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BlogPost } from "@blogstack/ui/components/blog-post";
import {
  BlogStackApiError,
  articleJsonLd,
  publicationMetadata,
} from "@blogstack/sdk";
import {
  blog,
  blogInfo,
  projectSlug,
  apiUrl,
  blogUrl,
} from "../../../lib/blog";
export const dynamic = "force-dynamic";
const getPost = cache(async (slug: string) => {
  try {
    return await blog.public.getPost(projectSlug, slug);
  } catch (error) {
    if (error instanceof BlogStackApiError && [404, 410].includes(error.status))
      notFound();
    throw error;
  }
});
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  return publicationMetadata(post, blogUrl);
}
export default async function Article({ params }: Props) {
  const slug = (await params).slug;
  const [post, info] = await Promise.all([getPost(slug), blogInfo()]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: articleJsonLd(post, blogUrl) }}
      />
      <BlogPost
        projectSlug={projectSlug}
        apiUrl={apiUrl}
        slug={slug}
        initialPost={post}
        backHref="/blog"
        showAttribution={info.branding.showAttribution}
        analytics={info.analyticsEnabled}
      />
    </>
  );
}
