// metrics.js
const client = require('prom-client');
const express = require('express');
const app = express();
const register = new client.Registry();

// --- Les Métriques ---
const testsSucceeded = new client.Counter({
  name: 'playwright_tests_succeeded_total',
  help: 'Nombre total de tests Playwright réussis',

});
register.registerMetric(testsSucceeded);

const testsFailed = new client.Counter({
  name: 'playwright_tests_failed_total',
  help: 'Nombre total de tests Playwright échoués',
});
register.registerMetric(testsFailed);

const testDuration = new client.Histogram({
  name: 'playwright_test_duration_seconds',
  help: 'Durée d\'exécution des tests Playwright en secondes',
  // labelNames: ['test_file', 'test_title', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 180, 240, 300] // Example buckets in seconds
});
register.registerMetric(testDuration);

const port = process.env.METRICS_PORT || 3001; // Utilisation Port 3001

// Parse
app.use(express.json()); 

// Partie pour que Prometheus Scrape
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// Affichage resultats
app.post('/report-test', (req, res) => {
  const { status, duration} = req.body; // Extract data sent from Playwright

  console.log(`Received test report: Status=${status}, Duration=${duration}`); // Debugage

  try {
    if (status === 'passed') {
      testsSucceeded.inc(); // On Incremente
    } else if (status === 'failed' || status === 'timedOut') {

      testsFailed.inc(); //  On Incremente
    }
    // On stocke la durée de chaque test
    if (typeof duration === 'number' && duration >= 0) {
       testDuration.observe(duration / 1000); // Conversion de ms to s
    }

    res.status(200).send('Metric received');
  } catch (error) {
      console.error("Error processing metric:", error);
      res.status(500).send('Error processing metric');
  }
});
// Eviter que plusieurs serveurs écoutent sur le port 3000
if (!global.metricsServer) {
  global.metricsServer = app.listen(port, () => {
    console.log(`Serveur métriques en écoute sur http://localhost:${port}`); 
  });

  global.metricsServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Le port ${port} est déjà utilisé. Le serveur est peut-être déjà lancé dans un autre processus.`);
    } else {
      console.error('Erreur du serveur métriques:', err);
    }
  });
} else {
    console.log(`Serveur métriques déjà lancé sur le port ${port}.`);
}

// Les métriques à envoyer
module.exports = { testsSucceeded, testsFailed, testDuration, register };
