const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

const PORT = process.env.PORT || 3000;

// CORS abierto: Permite que el frontend se mude a cualquier host/dominio sin romper la API
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50, 
  handler: (req, res) => {
    res.status(429).json([]); 
  }
});
app.use('/api/', limiter);

let noticiasCache = null;
let ultimaActualizacion = 0;
let promesaActualizacion = null;

const TIEMPO_EXPIRACION = 12 * 60 * 60 * 1000; 

async function obtenerNoticiasDeAPI() {
  const API_KEY = process.env.NEWSDATA_API_KEY;
  if (!API_KEY) throw new Error('');

  const query = '"Servicio de Administración Tributaria" OR "reforma fiscal" OR "contabilidad financiera"';
  const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&q=${encodeURIComponent(query)}&country=mx`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'error') {
    throw new Error('Error en NewsData');
  }

  return (data.results || []).map(item => ({
    title: item.title,
    description: item.description || '',
    url: item.link, 
    publishedAt: item.pubDate,
    source: { name: item.source_id || 'NewsData' },
    image: item.image_url || null
  }));
}

app.get('/api/noticias-sat', async (req, res) => {
  const ahora = Date.now();

  if (noticiasCache && (ahora - ultimaActualizacion < TIEMPO_EXPIRACION)) {
    return res.json(noticiasCache);
  }

  if (promesaActualizacion) {
    try {
        const articles = await promesaActualizacion;
        return res.json(articles);
    } catch (error) {
        if (noticiasCache) return res.json(noticiasCache);
        return res.json([]); 
    }
  }
  
  try {
    promesaActualizacion = obtenerNoticiasDeAPI();
    const articles = await promesaActualizacion;
    
    if (articles.length > 0) {
      noticiasCache = articles;
      ultimaActualizacion = Date.now();
    }
    
    promesaActualizacion = null;
    return res.json(articles); 

  } catch (error) {
    promesaActualizacion = null; 
    
    if (noticiasCache) {
      return res.json(noticiasCache);
    }

    return res.json([]); 
  }
});

app.get('/', (req, res) => {
  res.send(''); 
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);   
});
