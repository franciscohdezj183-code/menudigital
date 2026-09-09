import MenuImage from './MenuImage.jsx';
import { initials } from '../../utils/images.js';

export default function BusinessHero({ business }) {
  return (
    <header className="business-hero">
      <div className="cover-wrap">
        <MenuImage className="business-cover" src={business.cover_url} alt="" loading="eager" />
        <p className="cover-label">Menú digital</p>
        <div className="business-identity">
          <div className="business-avatar-flip">
            <div className="business-avatar-flip__inner">
              <div className="business-avatar-flip__face business-avatar-flip__front">
                <MenuImage className="business-logo" src={business.logo_url} alt={`Logo de ${business.name}`} fallback={initials(business.name)} loading="eager" />
              </div>
              <div className="business-avatar-flip__face business-avatar-flip__back">
                <img src="/avatar.gif" alt="Animación de brindis" decoding="async" />
              </div>
            </div>
          </div>
          <h1 className="business-name">{business.name}</h1>
        </div>
      </div>
      <div className="business-intro">
        {business.description && <p className="business-description">{business.description}</p>}
        {business.address && <p className="business-address"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><span>{business.address}</span></p>}
      </div>
    </header>
  );
}
