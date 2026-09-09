import { useState } from 'react';
import { optimizedImageUrl } from '../../utils/images.js';

export default function MenuImage({ src, alt, fallback, className = '', loading = 'lazy', width, height }) {
  const [failedSource, setFailedSource] = useState(null);
  const safeSource = optimizedImageUrl(src, { width, height });
  const showImage = safeSource && failedSource !== safeSource;
  return (
    <div className={`menu-image ${className} ${showImage ? 'has-image' : 'is-fallback'}`}>
      {showImage ? <img src={safeSource} alt={alt} loading={loading} decoding="async" onError={() => setFailedSource(safeSource)} /> : <span className="image-fallback" aria-hidden="true">{fallback}</span>}
    </div>
  );
}
