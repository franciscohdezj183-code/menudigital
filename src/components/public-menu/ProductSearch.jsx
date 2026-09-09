export default function ProductSearch({ value, onChange, onClear, categoryName, inputRef }) {
  const placeholder = categoryName.length <= 24 ? `Buscar en ${categoryName}...` : 'Buscar productos...';
  return (
    <div className="product-search" role="search">
      <label htmlFor="product-search" className="sr-only">Buscar productos en {categoryName}</label>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      <input ref={inputRef} id="product-search" type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" maxLength={150} />
      {value && <button className="clear-search" type="button" onClick={onClear} aria-label="Limpiar búsqueda"><span aria-hidden="true">×</span></button>}
    </div>
  );
}
