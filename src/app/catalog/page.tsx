import Link from "next/link";

import { loadCatalogue, type Product } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  let products: Product[] = [];
  let loadError = "";

  try {
    products = await loadCatalogue();
  } catch {
    loadError = "Add public/catalog/product-list.xlsx to load the catalogue.";
  }

  const categories = [...new Set(products.map((product) => product.category || "Featured"))];

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-5 py-6 text-[var(--ink)] lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div>
            <p className="text-sm font-semibold text-[var(--navy)]">School Email Scraper</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Product catalogue</p>
          </div>
          <Link href="/" className="text-xs font-semibold text-[var(--blue)] hover:underline">Back to workspace</Link>
        </header>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--orange)]">Publisher resources</p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--navy)]">Product catalogue</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Browse the latest products and resources available for schools and educators.</p>
          </div>
          <a href="/api/catalog/export" className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--navy)] px-4 text-xs font-semibold text-white hover:bg-[var(--blue)]">Download Catalogue <span aria-hidden="true" className="ml-2">&#8595;</span></a>
        </div>

        {loadError ? (
          <section className="rounded-xl border border-dashed border-[var(--line)] bg-white px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-[var(--navy)]">Catalogue file not found</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{loadError}</p>
          </section>
        ) : products.length === 0 ? (
          <section className="rounded-xl border border-dashed border-[var(--line)] bg-white px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-[var(--navy)]">No products available</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Copy the product catalogue workbook into the public/catalog folder.</p>
          </section>
        ) : (
          <div className="space-y-8">
            {categories.map((category) => (
              <section key={category}>
                <div className="mb-3 flex items-center gap-3"><h2 className="text-lg font-semibold text-[var(--navy)]">{category}</h2><span className="h-px flex-1 bg-[var(--line)]" /></div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {products.filter((product) => (product.category || "Featured") === category).map((product) => (
                    <article key={`${category}-${product.name}`} className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-[0_6px_20px_rgba(21,44,67,0.04)]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--orange)]">{category}</p>
                      <h3 className="mt-2 text-base font-semibold text-[var(--navy)]">{product.name}</h3>
                      <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--muted)]">{product.description || "Explore this resource in the full product catalogue."}</p>
                      {product.pdfUrl && <a href={product.pdfUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-xs font-semibold text-[var(--blue)] hover:underline">View PDF <span aria-hidden="true" className="ml-1">&#8599;</span></a>}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
