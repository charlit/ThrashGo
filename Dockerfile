FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

# le dossier data est monté en volume (voir docker-compose.yml) pour que
# les scores et visites survivent aux redémarrages/mises à jour du conteneur
RUN mkdir -p /app/data

EXPOSE 8080
ENV PORT=8080

CMD ["node", "server.js"]
