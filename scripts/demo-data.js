// Datos ficticios, usados únicamente por el seed explícito de desarrollo.
export const demoCategories = [
  { name: 'Cervezas', products: [
    { name: 'Corona Extra', description: 'Cerveza clara, bien fría.', price: '45.00' },
    { name: 'Victoria', description: null, price: '45.00' },
    { name: 'Modelo Especial', description: 'Cerveza de cuerpo ligero y sabor equilibrado.', price: '50.00', featured: true },
    { name: 'XX Lager', description: 'Refrescante y suave.', price: '45.50' },
  ] },
  { name: 'Preparadas', products: [
    { name: 'Michelada Clásica', description: 'Limón, salsas y escarchado de sal.', price: '65.00' },
    { name: 'Michelada Especial', description: 'Preparado de la casa con limón y un toque de chile.', price: '75.50', featured: true },
    { name: 'Cubana', description: null, price: '70.00' },
    { name: 'Azulito', description: 'Preparado cítrico, dulce y refrescante.', price: '80.00', available: false },
  ] },
  { name: 'Botanas', products: [
    { name: 'Papas preparadas', description: 'Papas crujientes con salsas y limón.', price: '55.00' },
    { name: 'Cacahuates', description: 'Para acompañar y compartir.', price: '30.00' },
    { name: 'Nachos', description: 'Totopos con queso y jalapeños.', price: '85.00', featured: true },
  ] },
  { name: 'Comida', products: [
    { name: 'Alitas', description: 'Crujientes, con salsa de la casa.', price: '120.00' },
    { name: 'Hamburguesa', description: 'Carne a la plancha, queso y vegetales frescos.', price: '110.00' },
    { name: 'Tacos', description: 'Tres tacos acompañados de salsa y limón.', price: '75.00' },
  ] },
];

// Presentaciones ficticias: se añaden sin sobrescribir modificaciones existentes.
export const demoVariants = {
  'Michelada Clásica': [
    { name: '355 ml', price: '65.00' }, { name: '473 ml', price: '75.00' }, { name: '1 litro', price: '110.00' },
    { name: 'Presentación de temporada', price: '90.00', active: false },
  ],
  'Modelo Especial': [{ name: 'Botella', price: '40.00' }, { name: 'Latón', price: '48.00' }],
  'Alitas': [{ name: '6 piezas', price: '95.00' }, { name: '12 piezas', price: '170.00' }, { name: '18 piezas', price: '235.00' }],
  'Azulito': [{ name: 'Vaso', price: '80.00' }, { name: '1 litro', price: '120.50' }],
};
