const express = require('express');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());

// --- VARIABLES GLOBALES PARA EL CACHÉ ---
let noticiasCache = null;
let ultimaActualizacion = 0;

// Configuración de expiración: 12 horas en milisegundos
const TIEMPO_EXPIRACION = 12 * 60 * 60 * 1000; 

app.get('/api/noticias-sat', async (req, res) => {
  const ahora = Date.now();

  // 1. Verificar si tenemos caché válido
  if (noticiasCache && (ahora - ultimaActualizacion < TIEMPO_EXPIRACION)) {
    console.log('Enviando noticias desde el caché local (0 tokens gastados)');
    return res.json(noticiasCache);
  }

  // 2. Extraer la llave de las variables de entorno
  const API_KEY = process.env.NEWSDATA_API_KEY;
  
  if (!API_KEY) {
    console.error('ERROR: No se encontró la variable NEWSDATA_API_KEY');
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  // 3. Preparar la consulta a la API de NewsData
  const query = 'SAT OR "reforma fiscal" OR "contabilidad financiera"';
  const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&q=${encodeURIComponent(query)}&country=mx`;

  try {
    console.log('Caché expirado o vacío. Consultando NewsData API...');
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Manejo de errores de la API (ej. límite de tokens alcanzado)
    if (data.status === 'error') {
        console.error('Error reportado por NewsData:', data.results?.message || data.message);
        
        // Servir caché de respaldo para evitar romper la vista del cliente
        if (noticiasCache) {
            console.log('Sirviendo caché de respaldo tras error de la API.');
            return res.json(noticiasCache);
        }
        return res.json([]);
    }

    // Mapear los resultados al formato esperado por Angular
    const articles = (data.results || []).map(item => ({
      title: item.title,
      description: item.description || '',
      url: item.link, 
      publishedAt: item.pubDate,
      source: {
        name: item.source_id || 'NewsData'
      },
      image: item.image_url || null
    }));
    
    // 4. Actualizar el caché y reiniciar el reloj
    if (articles.length > 0) {
      noticiasCache = articles;
      ultimaActualizacion = ahora;
    }
    
    // Enviar respuesta al cliente
    res.json(articles); 

  } catch (error) {
    console.error('Error al obtener noticias:', error);
    
    // Respaldo de emergencia por fallo de red
    if (noticiasCache) {
      console.log('Sirviendo caché de respaldo por error de red.');
      return res.json(noticiasCache);
    }

    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta base de comprobación
app.get('/', (req, res) => {
  res.send('API de Noticias funcionando correctamente');
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);   
});
