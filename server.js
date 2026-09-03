const express = require('express');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/api/noticias-sat', async (req, res) => {
  // Llave extraída de tu captura de pantalla
  const API_KEY = 'pub_4f0f28e29ce54283b4f948f610ead8a3'; 
  
  // Mantenemos tu búsqueda original. Usamos 'q' para buscar en todo el texto.
  const query = 'SAT OR "reforma fiscal" OR "contabilidad financiera"';
  
  // Endpoint de NewsData filtrando por México como muestra tu imagen
  const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&q=${encodeURIComponent(query)}&country=mx`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Si la API falla o excedes el límite, devolvemos un arreglo vacío
    if (data.status === 'error') {
        console.error('Error de NewsData:', data.results.message);
        return res.json([]);
    }

    // Mapeamos los resultados ('results') para que tu frontend en Angular reciba exactamente
    // la misma estructura de propiedades que recibía con GNews.
    const articles = (data.results || []).map(item => ({
      title: item.title,
      description: item.description || '',
      url: item.link, 
      publishedAt: item.pubDate,
      source: {
        name: item.source_id || 'NewsData'
      },
      image: item.image_url || null // NewsData a veces incluye imagen
    }));
    
    res.json(articles); 
  } catch (error) {
    console.error('Error al obtener noticias:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/', (req, res) => {
  res.send('API de Noticias funcionando correctamente');
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});
