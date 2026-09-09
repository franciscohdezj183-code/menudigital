export default function ProductDetailSkeleton() {
  return <section aria-label="Cargando el producto">
    <span className="sr-only" role="status">Cargando el producto…</span>
    <div aria-hidden="true">
      <div className="skeleton detail-skeleton-header" />
      <div className="skeleton detail-image" />
      <div className="detail-info">
        <div className="skeleton detail-skeleton-title" />
        <div className="skeleton detail-skeleton-price" />
        <div className="skeleton detail-skeleton-description" />
        <div className="detail-variants">
          <div className="skeleton detail-skeleton-price" />
          {[0, 1, 2].map(i => <div key={i} className="skeleton detail-skeleton-variant" />)}
        </div>
      </div>
    </div>
  </section>;
}
