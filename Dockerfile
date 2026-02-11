FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:22

COPY package*.json dist/index.mjs .env ./
RUN npm i --production

CMD [ "index.handler" ]