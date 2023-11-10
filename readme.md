# Check tournaments
Automated check of new padel tounaments with puppeteer.

## Stack
 - Puppeteer is used to automate the booking process.
 - Deployed to AWS Lambda with puppeteer and puppeteer_core in layers.

### Local
The app uses a special chromium that only works on AWS Lambda. You can use the docker image to run the app locally.

Mac : impossible

Windows :
- Build the docker image : `docker build -t padelito .`
- Run the docker image : `docker run -p 9000:8080 -v ${pwd}/screenshots:/var/task/screenshots padelito:latest`
- curl the lambda function : `curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations"`

## Deployment
Manually from the AWS Console.
- The source code is on the `check-tounaments` lambda.
- The dependencies are on the `padelito` layer.
