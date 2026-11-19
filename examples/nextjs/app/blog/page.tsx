import type { Metadata } from "next";
import { BlogListing } from "../../components/blog-listing";
import { blog, blogInfo, projectSlug, apiUrl, blogUrl } from "../../lib/blog";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Blog",
  alternates: { canonical: blogUrl },
};
export default async function BlogPage() {
  const [info, posts, tags] = await Promise.all([
    blogInfo(),
    blog.public.listPosts(projectSlug, { limit: 9 }),
    blog.public.listTags(projectSlug),
  ]);
  return (
    <BlogListing
      projectSlug={projectSlug}
      apiUrl={apiUrl}
      title={info.name}
      initialPosts={posts.data}
      initialTags={tags}
      initialNextCursor={posts.nextCursor}
      showAttribution={info.branding.showAttribution}
    />
  );
}
