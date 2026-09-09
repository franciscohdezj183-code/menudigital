export default function CategorySkeleton() {
  return (
    <div role="status" aria-label="Cargando la categoría">
      <span className="sr-only">Cargando la categoría</span>
      <div aria-hidden="true">
        <div className="category-skeleton-hero skeleton" />
        <div className="category-skeleton-header">
          <div className="category-skeleton-controls">
            <div className="category-skeleton-back skeleton" />
            <div className="category-skeleton-title skeleton" />
          </div>
          <div className="category-skeleton-subtitle skeleton" />
        </div>
        <div className="category-products">
          <div className="category-skeleton-search skeleton" />
          <div className="product-count skeleton category-skeleton-count" />
          {[0, 1, 2, 3, 4].map(id => <div className="product-row product-skeleton" key={id}>
            <div className="product-photo skeleton" />
            <div className="product-info">
              <div className="skeleton product-skeleton-name" />
              <div className="skeleton product-skeleton-description" />
            </div>
            <div className="skeleton product-skeleton-action" />
          </div>)}
        </div>
      </div>
    </div>
  );
}
