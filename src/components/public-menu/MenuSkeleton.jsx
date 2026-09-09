export default function MenuSkeleton() {
  return (
    <div role="status" aria-label="Cargando el menú">
      <span className="sr-only">Cargando el menú</span>
      <div aria-hidden="true">
        <div className="skeleton-hero">
          <div className="skeleton skeleton-cover" />
          <div className="skeleton-identity">
            <div className="skeleton skeleton-logo" />
            <div className="skeleton skeleton-name" />
          </div>
        </div>
        <div className="skeleton-intro">
          <div className="skeleton skeleton-description" />
        </div>
        <div className="categories-section">
          <div className="skeleton skeleton-section-title" />
          <div className="category-list">{[0, 1, 2].map((id) => <div key={id} className="skeleton skeleton-card" />)}</div>
        </div>
      </div>
    </div>
  );
}
