const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const url = req.query.url;
  
  if (url === 'https://app.philantrac.com/dahboardTest') {
    res.json({
      title: 'Philantrac Dashboard',
      description: 'Manage your philanthropic activities and track your impact with Philantrac\'s comprehensive dashboard.',
      og: {
        title: 'Philantrac Dashboard',
        description: 'Manage your philanthropic activities and track your impact with Philantrac\'s comprehensive dashboard.',
        type: 'website',
        url: url,
        image: 'https://storage.googleapis.com/flutterflow-prod-hosting/builds/hQTWnY6vuQnhL0Zs6C26/Final_PNG.png'
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Philantrac Dashboard',
        description: 'Manage your philanthropic activities and track your impact with Philantrac\'s comprehensive dashboard.',
        image: 'https://storage.googleapis.com/flutterflow-prod-hosting/builds/hQTWnY6vuQnhL0Zs6C26/Final_PNG.png'
      }
    });
  } else {
    res.status(404).json({ error: 'URL not found' });
  }
});

module.exports = router; 