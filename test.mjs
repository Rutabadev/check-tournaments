const loginData = new URLSearchParams();
loginData.append("ajax", "connexionUser");
loginData.append("email", "etienner37@gmail.com");
loginData.append("pass", "7c3bK!k6ca4qbYy");
loginData.append("compte", "user");

const loginResponse = await fetch(
  "https://toulousepadelclub.gestion-sports.com/traitement/connexion.php",
  {
    method: "POST",
    body: loginData,
  }
);

const responseCookies = loginResponse.headers.get("set-cookie");
const phpSessid = responseCookies?.match(/PHPSESSID=(.*?);/)?.[1];
const phpSessIdExpiration = responseCookies?.match(
  /PHPSESSID=.*?; expires=(.*?);/
)?.[1];
const cookCompte = responseCookies?.match(/COOK_COMPTE=(.*?);/)?.[1];
const cookCompteExpiration = responseCookies?.match(
  /COOK_COMPTE=.*?; expires=(.*?);/
)?.[1];

const cookies = {
  PHPSESSID: phpSessid ?? "",
  COOK_COMPTE: cookCompte ?? "",
  expiry: cookCompteExpiration ?? "",
};

console.log(phpSessIdExpiration, cookCompteExpiration);

const tournoiPage = await fetch(
  "https://toulousepadelclub.gestion-sports.com/membre/events/event.html?event=1174",
  {
    headers: {
      cookie:
        "COOK_ID_CLUB=88; COOK_ID_USER=126667; COOK_COMPTE=e2be1cc8ff4f0a765ebcbbc1cc94acca0a6c1f4e;",
    },
  }
).then((res) => res.text());
console.log(tournoiPage.split("\n")[0]);
