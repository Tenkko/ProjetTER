# Guide d'Installation Consolidé (Mis à jour)

## Objectif
Mettre en place une stack de monitoring (Prometheus, Grafana, Node Exporter via Docker) pour surveiller une VM, préparer un environnement pour exécuter des tests Playwright manuellement (ou via une autre automatisation), et envoyer les résultats de ces tests à Prometheus via un exportateur custom (`metrics.js`), le tout visualisable dans Grafana.

## Composants

1. **VM Cible (`remotelabz@192.168.1.93`)** : Héberge l'application testée, `node-exporter` (Docker), le script `metrics.js`, le projet Playwright.
2. **Serveur de Monitoring** : Héberge Prometheus et Grafana (peut être la même VM ou une autre machine).

---

## Guide d'Installation Étape par Étape

### Partie 1 : Configuration de la VM Cible (`remotelabz@192.168.1.93`)

#### Prérequis
- Accès SSH à la VM
- Droits `sudo`

#### Étape 1.1 : Installer Node.js et npm
Vérifiez si déjà installés :
```bash
node -v
npm -v
```
Si non installés, installez la version LTS :
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y nodejs
```

#### Étape 1.2 : Installer Docker et Lancer `node-exporter` via Docker
Installez Docker Engine :
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```
Lancez `node-exporter` :
```bash
sudo docker run -d \
  --name node-exporter \
  --restart=unless-stopped \
  --net="host" \
  --pid="host" \
  -v "/:/host:ro,rslave" \
  quay.io/prometheus/node-exporter:latest \
  --path.rootfs=/host
```
Vérifiez :
```bash
sudo docker ps
curl http://localhost:9100/metrics
```

#### Étape 1.3 : Préparer le Projet Playwright et `metrics.js`
```bash
cd /home/remotelabz/
npm init -y
npm install @playwright/test express prom-client axios --save-dev
npx playwright install
```

#### Étape 1.4 : Configurer et Lancer `metrics.js` avec `pm2`
```bash
sudo npm install pm2 -g
pm2 start metrics.js --name playwright-metrics
pm2 list
pm2 startup
pm2 save
curl http://localhost:3001/metrics
```

---

### Partie 2 : Installation du Serveur de Monitoring (Prometheus & Grafana)

#### Étape 2.1 : Installer Prometheus
```bash
VERSION="2.53.0"
wget https://github.com/prometheus/prometheus/releases/download/v${VERSION}/prometheus-${VERSION}.linux-amd64.tar.gz
tar xvf prometheus-${VERSION}.linux-amd64.tar.gz
sudo mv prometheus-${VERSION}.linux-amd64 /opt/prometheus
```
Créez et configurez `/opt/prometheus/prometheus.yml` :
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'node_exporter'
    static_configs:
      - targets: ['192.168.1.93:9100']
  - job_name: 'playwright_metrics'
    static_configs:
      - targets: ['192.168.1.93:3001']
```
Activez Prometheus en tant que service :
```bash

cd etc/systemd/sytem

[Unit]
Description=Prometheus
Wants=network-online.target
After=network-online.target

[Service]
User=root
ExecStart=/home/remotelabz/prometheus-2.47.2.linux-amd64/prometheus \
  --config.file=/home/remotelabz/prometheus-2.47.2.linux-amd64/prometheus.yml \
  --web.listen-address=:9090
Restart=always

[Install]
WantedBy=multi-user.target

```
```bash
sudo systemctl daemon-reload
sudo systemctl enable prometheus
sudo systemctl start prometheus
sudo systemctl status prometheus
```

#### Étape 2.2 : Installer Grafana
```bash
sudo apt-get update
sudo apt-get install -y apt-transport-https software-properties-common wget
wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install grafana
sudo systemctl daemon-reload
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
sudo systemctl status grafana-server
```

---

### Partie 3 : Connecter Grafana à Prometheus
1. Accédez à Grafana : `http://<IP_Serveur_Monitoring>:3000` (login: admin/admin).
2. Configuration -> Data Sources -> Add data source -> Prometheus.
3. URL: `http://localhost:9090` (si même machine) ou `http://<IP_Prometheus>:9090`.
4. Save & Test.

---

### Partie 4 : Vérification Finale
1. Vérifiez les Cibles Prometheus : `http://<IP_Prometheus>:9090` -> Status -> Targets.
2. Exécutez les Tests Playwright :
```bash
cd /home/remotelabz/
npx playwright test
```
3. Créez des Dashboards Grafana pour visualiser les métriques.

---

### Dépannage
- Vérifiez les ports ouverts (`9100`, `3001`, `9090`, `3000`).
- Consultez les logs (`journalctl`, `pm2 logs`, `docker logs node-exporter`).
- Assurez-vous que les IP dans `prometheus.yml` sont correctes.

---

Fin du guide 🎯
