import CategoryCard from './CategoryCard.jsx';

export default function CategoryList({ categories, slug }) {
  return (
    <section className="categories-section" aria-labelledby="categories-title">
      <div className="section-heading">
        <h2 id="categories-title">Explora nuestro menú</h2>
        <span className="section-line" aria-hidden="true" />
      </div>
      {categories.length ? <ul className="category-list">
        {categories.map((category, index) => <CategoryCard key={category.id} category={category} index={index} slug={slug} />)}
      </ul> : <p className="empty-menu" role="status">El menú estará disponible próximamente.</p>}
    </section>
  );
}

