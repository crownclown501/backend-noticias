const express = require('express');
const cors = require('cors');
const app = express();

// Render te asignará un puerto automáticamente a través de process.env.PORT
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/api/noticias-sat', async (req, res) => {
  const API_KEY = '9acb3561422cee5120870b383ed50e25'; 
  const query = '"SAT" OR "contabilidad financiera" OR "reforma fiscal"';
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=es&country=mx&max=12&apikey=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data.articles || []); 
  } catch (error) {
    console.error('Error al obtener noticias:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta de prueba para saber si el servidor está vivo cuando entres a la URL principal
app.get('/', (req, res) => {
  res.send('API de Noticias funcionando correctamente');
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});
