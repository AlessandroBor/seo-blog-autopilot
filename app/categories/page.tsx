import { db, type BlogCategory } from "@/lib/supabase";
import { deleteCategory, upsertCategory } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { data } = await db().from("blog_categories").select("id, name, slug, description").order("name");
  const categories = (data ?? []) as BlogCategory[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <p className="text-sm text-zinc-600">
        The AI picks categories by reading <em>name: description</em>, so a clear description directly improves how posts get sorted.
      </p>

      <form action={upsertCategory} className="card grid gap-3 md:grid-cols-[12rem_1fr_auto]">
        <input name="name" className="input" placeholder="Name" required />
        <input name="description" className="input" placeholder="What belongs in this category?" />
        <button className="btn-primary">Add</button>
      </form>

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center gap-3 py-3">
            <form action={upsertCategory} className="grid flex-1 gap-3 md:grid-cols-[12rem_1fr_auto]">
              <input type="hidden" name="id" value={c.id} />
              <input name="name" className="input" defaultValue={c.name} />
              <input name="description" className="input" defaultValue={c.description ?? ""} />
              <button className="btn-ghost">Save</button>
            </form>
            <form action={deleteCategory.bind(null, c.id)}>
              <button className="btn-danger">Delete</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
