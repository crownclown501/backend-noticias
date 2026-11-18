const express = require('express');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- RATE LIMITING (Protección contra saturación de peticiones) ---
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
    return res.status(429).json({ error: 'Límite de peticiones excedido.' }); 
  }

  next();
});

// --- RUTA DE CONTACTO CON VALIDACIÓN DE RECAPTCHA Y EMAILJS ---
app.post('/api/contacto', async (req, res) => {
  const { nombre, email, telefono, mensaje, recaptchaToken } = req.body;

  // 1. Validar que el token de reCAPTCHA esté presente
  if (!recaptchaToken) {
    return res.status(400).json({ error: 'Token de seguridad requerido.' });
  }

  try {
    // 2. Verificar el token directamente con Google usando la clave secreta de Render
    const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
    if (!RECAPTCHA_SECRET_KEY) {
      console.error('Falta configurar RECAPTCHA_SECRET_KEY en las variables de entorno de Render.');
      return res.status(500).json({ error: 'Error de configuración en el servidor.' });
    }

    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
    const recaptchaRes = await fetch(verifyUrl, { method: 'POST' });
    const recaptchaResult = await recaptchaRes.json();

    // 3. Evaluar si la petición es legítima (Score mayor a 0.5)
    if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
      console.warn('Acción bloqueada por reCAPTCHA. Score:', recaptchaResult.score);
      return res.status(403).json({ error: 'Acción bloqueada por medidas de seguridad antispam.' });
    }

    // 4. Credenciales de EmailJS
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
        Mensaje: mensaje
      }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error desde EmailJS:', errorText);
      throw new Error('Error de EmailJS al procesar la solicitud');
    }

    return res.status(200).json({ success: true, message: 'Correo enviado con éxito.' });
  } catch (error) {
    console.error('Error procesando el contacto:', error);
    return res.status(500).json({ error: 'Hubo un error al enviar el correo.' });
  }
});

// --- CACHÉ Y OBTENCIÓN DE NOTICIAS (NEWSDATA.IO) ---
let noticiasCache = null;
let ultimaActualizacion = 0;
let promesaActualizacion = null;
const TIEMPO_EXPIRACION = 12 * 60 * 60 * 1000; 

/*async function obtenerNoticiasDeAPI() {
  const API_KEY = process.env.NEWSDATA_API_KEY;
  if (!API_KEY) throw new Error('Falta API Key de NewsData');

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
}*/
async function obtenerNoticiasDeAPI() {
  const API_KEY = process.env.NEWSDATA_API_KEY;
  if (!API_KEY) throw new Error('Falta API Key de NewsData');

  // 1. Consulta enfocada en términos técnicos reales del SAT y contabilidad en México
  const query = '("SAT" OR "Buzón Tributario" OR "contabilidad electrónica" OR "miscelánea fiscal" OR "declaración anual" OR "CFDI") AND (impuestos OR fiscal OR contribuyentes)';
  
  // 2. Agregamos language=es, category=business y removeduplicate=1 para evitar notas repetidas o irrelevantes
  const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&qInTitle=${encodeURIComponent('"SAT" OR "impuestos" OR "fiscal" OR "contabilidad" OR "CFDI" OR "Buzón Tributario"')}&country=mx&language=es&category=business&removeduplicate=1`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'error') {
    console.error('Detalle error NewsData:', data.results);
    throw new Error('Error en NewsData');
  }

  // Imágenes de respaldo corporativas por si una nota fiscal viene sin foto
  const imagenesRespaldo = [
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1586486855514-8c633cc6fd38?auto=format&fit=crop&w=800&q=80'
  ];

  return (data.results || [])
    .filter(item => item.title && item.description && item.description.length > 40)
    .map((item, index) => ({
      title: item.title,
      description: item.description,
      url: item.link,
      publishedAt: item.pubDate,
      source: { name: item.source_id || 'Actualidad Fiscal' },
      image: item.image_url || imagenesRespaldo[index % imagenesRespaldo.length]
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
    if (noticiasCache) return res.json(noticiasCache);
    return res.json([]); 
  }
});

app.get('/', (req, res) => {
  res.send('Backend de Huerta Díaz Activo y Seguro'); 
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);   
});
