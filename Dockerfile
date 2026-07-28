FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . ./

ENV HOST=0.0.0.0
EXPOSE 8000
CMD ["node", "api_server.js"]
