FROM node:18-alpine

# Arbeitsverzeichnis im Container erstellen
WORKDIR /app

# Package-Dateien kopieren und Abhängigkeiten installieren
COPY package*.json ./
RUN npm install --production

# Den Rest des Codes kopieren (server.js und public/)
COPY server.js ./
COPY public/ ./public/

# Port nach außen öffnen
EXPOSE 3000

# Server starten
CMD ["node", "server.js"]