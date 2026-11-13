const express = require('express');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const rateLimitMap = new Map();
app.use('/api/', (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ahora = Date.now();
  const limite = 50; 
  const ventana = 15 * 60 * 1000; 

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: ahora });
    return next();
  }

  const data = rateLimitMap.get(ip);
  if (ahora - data.start > ventana) {
    rateLimitMap.set(ip, { count: 1, start: ahora });
    return next();
  }

  data.count++;
  if (data.count > limite) {
    return res.status(429).json([]); 
  }

  next();
});
// --- RUTA PARA ENVIAR CORREOS CON EMAILJS ---
app.post('/api/contacto', async (req, res) => {
  const { nombre, email, telefono, mensaje } = req.body;

  const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY; 

  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    return res.status(500).json({ error: 'Faltan credenciales de EmailJS en el servidor.' });
  }

  const data = {
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    accessToken: PRIVATE_KEY, 
    template_params: {
      name: nombre,
      correo: email,
      telefono: telefono,
     // mensaje: mensaje,
      Mensaje: mensaje
    }
  };

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error desde EmailJS:', errorText);
      throw new Error('Error de EmailJS al procesar la solicitud');
    }

    return res.status(200).json({ success: true, message: 'Correo enviado.' });
  } catch (error) {
    console.error('Error enviando el correo:', error);
    return res.status(500).json({ error: 'Hubo un error al enviar el correo.' });
  }
});

// --- CACHÉ Y CANDADO (Protección de créditos y memoria) ---
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
