const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: 'https://huertdiaz.netlify.app',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50, 
  message: { error: 'Demasiadas peticiones. Por favor, intenta más tarde.' }
});
app.use('/api/', limiter);

let noticiasCache = null;
let ultimaActualizacion = 0;
let promesaActualizacion = null;

const TIEMPO_EXPIRACION = 12 * 60 * 60 * 1000; 

async function obtenerNoticiasDeAPI() {
  const API_KEY = process.env.NEWSDATA_API_KEY;
  if (!API_KEY) throw new Error('No se encontró la variable NEWSDATA_API_KEY');

  const query = '"Servicio de Administración Tributaria" OR "reforma fiscal" OR "contabilidad financiera"';
  const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&q=${encodeURIComponent(query)}&country=mx`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(data.results?.message || data.message || 'Error en NewsData');
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
        return res.status(500).json({ error: 'Error interno del servidor' });
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

    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/', (req, res) => {
  res.send('API de Noticias funcionando correctamente');
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);   
});
