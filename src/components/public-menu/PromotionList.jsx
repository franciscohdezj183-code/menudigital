import MenuImage from './MenuImage.jsx';
import { formatPrice } from '../../utils/products.js';
import { initials } from '../../utils/images.js';

export default function PromotionList({ promotions = [], coverUrl = null }) {
  if (!promotions.length) return null;
  const baseSlides = [
    ...(coverUrl ? [{ type: 'cover', copyIndex: 0 }] : []),
    ...promotions.map(item => ({ type: 'promotion', item, copyIndex: 0 })),
  ];
  const isLooping = promotions.length === 1 && Boolean(coverUrl);
  const visiblePromotions = isLooping
    ? Array.from({ length: 3 }, (_, copyIndex) => baseSlides.map(slide => ({ ...slide, copyIndex }))).flat()
    : baseSlides;

  return (
    <section className="promotion-section" aria-labelledby="promotions-title">
      <div className="section-heading">
        <span className="section-line" />
        <h2 id="promotions-title">Promociones</h2>
        <span className="section-line" />
      </div>
      <ul className={`promotion-carousel${isLooping ? ' is-looping' : ''}`} aria-label="Promociones disponibles">
        {visiblePromotions.map(({ type, item, copyIndex }) => type === 'cover' ? (
          <li className="promotion-card promotion-cover-card" key={`cover-${copyIndex}`} aria-hidden="true">
            <MenuImage src={coverUrl} alt="" fallback="✦" width={640} />
          </li>
        ) : (
          <li className="promotion-card" key={`${item.id}-${copyIndex}`} aria-hidden={copyIndex > 0 ? 'true' : undefined}>
            <MenuImage src={item.image_url} alt="" fallback={initials(item.title)} width={640} />
            <div className="promotion-content">
              <h3>{item.title}</h3>
              {item.price != null && <strong className="promotion-price">{formatPrice(item.price)}</strong>}
              {item.description && <p>{item.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
