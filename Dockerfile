FROM public.ecr.aws/lambda/nodejs:18

COPY package*.json index.mjs screenshots ./
RUN npm i --production
ENV SCREENSHOT=true

CMD [ "index.handler" ]