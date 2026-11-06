import React from 'react';

export default function CommercialFilterScope({ except }) {
  return <p className={`commercial-filter-scope${except ? ' commercial-filter-scope--partial' : ''}`}>
    {except ? `Filtro general parcial · ${except}` : 'Responde al filtro general'}
  </p>;
}
